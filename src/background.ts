/// <reference types="chrome"/>
import type {
  ExtensionSettings,
  ExtractContentMessage,
  Memory
} from "./types/memory";

// Background service worker for Browser AI Memory extension

// Install event
chrome.runtime.onInstalled.addListener(
  (details: chrome.runtime.InstalledDetails) => {
    if (details.reason === "install") {
      console.log("Browser AI Memory extension installed");

      // Initialize storage with auto-save enabled by default
      chrome.storage.local.set({
        memories: [] as Memory[],
        settings: {
          autoSave: true, // Enable auto-save by default
          maxMemories: 100,
          aiProvider: "local"
        } as ExtensionSettings
      });

      // Create context menu
      chrome.contextMenus.create({
        id: "saveToMemory",
        title: "Save to AI Memory",
        contexts: ["page", "selection"]
      });
    }
  }
);

// Context menu click handler
chrome.contextMenus.onClicked.addListener(
  (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    if (info.menuItemId === "saveToMemory" && tab) {
      savePageToMemory(tab, info.selectionText);
    }
  }
);

// Tab update listener (for auto-save feature)
chrome.tabs.onUpdated.addListener(
  async (
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ) => {
    if (changeInfo.status === "complete" && tab.url) {
      try {
        // Skip unwanted URLs
        if (
          tab.url.startsWith("chrome://") ||
          tab.url.startsWith("chrome-extension://") ||
          tab.url.startsWith("moz-extension://") ||
          tab.url.startsWith("edge://") ||
          tab.url.startsWith("about:") ||
          tab.url.startsWith("data:") ||
          tab.url.startsWith("blob:") ||
          tab.url === "about:blank"
        ) {
          return;
        }

        const result = await chrome.storage.local.get(["settings"]);
        const settings: ExtensionSettings = result.settings;

        if (settings?.autoSave) {
          // Auto-save page after a short delay to ensure page is fully loaded
          setTimeout(() => {
            savePageToMemory(tab);
          }, 3000); // Increased delay to 3 seconds for better content extraction
        }
      } catch (error) {
        console.error("Error in tab update listener:", error);
      }
    }
  }
);

// Message handler
chrome.runtime.onMessage.addListener(
  (
    request: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) => {
    switch (request.action) {
      case "saveCurrentPage":
        if (sender.tab) {
          savePageToMemory(sender.tab);
        }
        return false;

      case "searchMemories":
        searchMemories(request.query).then(sendResponse);
        return true; // Keep message channel open for async response

      case "getSettings":
        chrome.storage.local.get(["settings"]).then(sendResponse);
        return true;

      case "updateSettings":
        chrome.storage.local
          .set({ settings: request.settings })
          .then(sendResponse);
        return true;

      default:
        return false;
    }
  }
);

// Save page to memory
async function savePageToMemory(
  tab: chrome.tabs.Tab,
  selectedText?: string
): Promise<void> {
  try {
    // Skip certain URLs
    if (
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("moz-extension://") ||
      tab.url.startsWith("edge://")
    ) {
      return;
    }

    if (!tab.id) {
      console.warn("Tab has no ID:", tab.url);
      return;
    }

    let response;
    try {
      // Extract content from the page
      const message: ExtractContentMessage = {
        action: "extractContent",
        includeSelection: !!selectedText
      };

      response = await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      // If content script is not available, create a basic response
      console.warn("Content script not available for tab:", tab.url, error);
      response = {
        content: tab.title || "No content available",
        title: tab.title || "",
        url: tab.url,
        domain: tab.url ? new URL(tab.url).hostname : ""
      };
    }

    if (!response) {
      console.warn("Could not extract content from tab:", tab.url);
      // Use basic tab info as fallback
      response = {
        content: tab.title || "No content available",
        title: tab.title || "",
        url: tab.url,
        domain: tab.url ? new URL(tab.url).hostname : ""
      };
    }

    const memory: Memory = {
      id: Date.now(),
      url: tab.url,
      title: tab.title || "",
      content:
        selectedText || response.content || tab.title || "No content available",
      fullContent: response.content || tab.title || "No content available",
      selectedText: selectedText,
      timestamp: new Date().toISOString(),
      favicon: tab.favIconUrl,
      domain: new URL(tab.url).hostname,
      tags: extractTags(response.content || tab.title || "", tab.title || "")
    };

    await addMemory(memory);

    // Show notification for manual saves (when selectedText is provided or context menu is used)
    if (selectedText) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.svg",
        title: "Page Saved to Memory",
        message: `"${tab.title}" has been saved to your AI memory`
      });
    }
  } catch (error) {
    console.error("Error saving page to memory:", error);
  }
}

// Add memory to storage
async function addMemory(memory: Memory): Promise<void> {
  const result = await chrome.storage.local.get(["memories", "settings"]);
  const memories: Memory[] = result.memories || [];
  const settings: ExtensionSettings = result.settings;

  // Avoid duplicates (same URL within last hour)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const isDuplicate = memories.some(
    (m) => m.url === memory.url && new Date(m.timestamp).getTime() > oneHourAgo
  );

  if (!isDuplicate) {
    memories.unshift(memory);

    // Limit number of memories
    const maxMemories = settings?.maxMemories || 100;
    const trimmedMemories = memories.slice(0, maxMemories);

    await chrome.storage.local.set({ memories: trimmedMemories });
  }
}

// Search memories
async function searchMemories(query: string): Promise<Memory[]> {
  const result = await chrome.storage.local.get(["memories"]);
  const memories: Memory[] = result.memories || [];

  if (!query) return memories.slice(0, 10);

  const lowercaseQuery = query.toLowerCase();
  const results = memories.filter(
    (memory) =>
      memory.title.toLowerCase().includes(lowercaseQuery) ||
      memory.content.toLowerCase().includes(lowercaseQuery) ||
      memory.url.toLowerCase().includes(lowercaseQuery) ||
      memory.domain.toLowerCase().includes(lowercaseQuery) ||
      memory.tags.some((tag) => tag.toLowerCase().includes(lowercaseQuery))
  );

  // Sort by relevance (simple scoring)
  return results.sort((a, b) => {
    const scoreA = calculateRelevanceScore(a, lowercaseQuery);
    const scoreB = calculateRelevanceScore(b, lowercaseQuery);
    return scoreB - scoreA;
  });
}

// Calculate relevance score for search results
function calculateRelevanceScore(memory: Memory, query: string): number {
  let score = 0;
  const queryWords = query.split(" ");

  queryWords.forEach((word) => {
    if (memory.title.toLowerCase().includes(word)) score += 3;
    if (memory.content.toLowerCase().includes(word)) score += 1;
    if (memory.url.toLowerCase().includes(word)) score += 2;
    if (memory.tags.some((tag) => tag.toLowerCase().includes(word))) score += 2;
  });

  return score;
}

// Extract tags from content
function extractTags(content: string, title: string): string[] {
  const text = `${title} ${content}`.toLowerCase();

  // Simple keyword extraction
  const keywords = text.match(/\b\w{4,}\b/g) || [];
  const wordFreq: Record<string, number> = {};

  keywords.forEach((word) => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });

  // Get top keywords as tags
  const sortedWords = Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word]) => word);

  return sortedWords;
}

// Periodic cleanup
chrome.alarms.create("cleanup", { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
  if (alarm.name === "cleanup") {
    cleanupOldMemories();
  }
});

async function cleanupOldMemories(): Promise<void> {
  const result = await chrome.storage.local.get(["memories", "settings"]);
  const memories: Memory[] = result.memories || [];
  const settings: ExtensionSettings = result.settings;

  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  const cutoff = Date.now() - maxAge;

  const filteredMemories = memories.filter(
    (memory) => new Date(memory.timestamp).getTime() > cutoff
  );

  if (filteredMemories.length !== memories.length) {
    await chrome.storage.local.set({ memories: filteredMemories });
    console.log(
      `Cleaned up ${memories.length - filteredMemories.length} old memories`
    );
  }
}
