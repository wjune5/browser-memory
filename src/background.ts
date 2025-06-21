/// <reference types="chrome"/>
import { EmbeddingsService, EmbeddingsStorage } from "./embeddings";
import type {
  EmbeddingConfig,
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

// Add memory to storage with embeddings
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
    try {
      // Generate embeddings for the memory
      const embeddingConfig: EmbeddingConfig = {
        model: settings?.apiKey ? "openai" : "local", // Use OpenAI if API key available, otherwise local
        dimensions: settings?.apiKey ? 1536 : 384, // OpenAI: 1536, Local: 384
        maxTokens: 500,
        chunkOverlap: 50
      };

      const embeddingsService = new EmbeddingsService(embeddingConfig);

      // Generate embedding for the main content
      const contentToEmbed = memory.content || memory.title || "";
      if (contentToEmbed.trim()) {
        try {
          memory.embedding = await embeddingsService.generateEmbedding(
            contentToEmbed
          );

          // If content is long, also create chunks with embeddings
          if (contentToEmbed.length > 1000) {
            const chunks = embeddingsService.chunkText(contentToEmbed);
            memory.chunks = [];

            for (const chunk of chunks.slice(0, 5)) {
              // Limit to 5 chunks to save storage
              try {
                chunk.embedding = await retryWithBackoff(
                  () => embeddingsService.generateEmbedding(chunk.content),
                  `chunk ${chunk.id}`
                );
                memory.chunks.push(chunk);
              } catch (chunkError) {
                console.warn(
                  `⚠️ Failed to generate embedding for chunk ${chunk.id} after retries:`,
                  {
                    chunkId: chunk.id,
                    chunkLength: chunk.content.length,
                    error:
                      chunkError instanceof Error
                        ? chunkError.message
                        : chunkError,
                    url: memory.url,
                    title: memory.title?.substring(0, 50) + "..."
                  }
                );
                // Skip chunks that fail embedding generation to avoid chunks without embeddings
                console.log(
                  `🚫 Skipping chunk ${chunk.id} due to embedding failure`
                );
              }
            }
          }
        } catch (embeddingError) {
          console.warn(
            "Failed to generate embeddings, storing without embeddings:",
            embeddingError
          );
        }
      }

      // Use EmbeddingsStorage to handle size limits and storage
      await EmbeddingsStorage.storeMemoryWithEmbeddings(memory);
    } catch (error) {
      console.error(
        "Error processing embeddings, falling back to simple storage:",
        error
      );
      // Fallback to simple storage without embeddings
      memories.unshift(memory);
      const maxMemories = settings?.maxMemories || 100;
      const trimmedMemories = memories.slice(0, maxMemories);
      await chrome.storage.local.set({ memories: trimmedMemories });
    }
  }
}

// Helper function for retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(
          `🔄 Retrying ${context} (attempt ${attempt + 1}/${
            maxRetries + 1
          }) after ${delay}ms delay`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`❌ Attempt ${attempt + 1} failed for ${context}:`, {
        error: error instanceof Error ? error.message : error,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1
      });

      if (attempt === maxRetries) {
        console.error(
          `🚨 All ${maxRetries + 1} attempts failed for ${context}`,
          lastError
        );
        throw lastError;
      }
    }
  }

  throw lastError;
}

// Search memories with semantic search support
async function searchMemories(query: string): Promise<Memory[]> {
  const result = await chrome.storage.local.get(["memories", "settings"]);
  const memories: Memory[] = result.memories || [];
  const settings: ExtensionSettings = result.settings;

  if (!query) return memories.slice(0, 10);

  // Try semantic search if embeddings are available
  const memoriesWithEmbeddings = memories.filter(
    (m) => m.embedding && m.embedding.length > 0
  );

  if (memoriesWithEmbeddings.length > 0) {
    try {
      const embeddingConfig: EmbeddingConfig = {
        model: settings?.apiKey ? "openai" : "local",
        dimensions: settings?.apiKey ? 1536 : 384,
        maxTokens: 500,
        chunkOverlap: 50
      };

      const embeddingsService = new EmbeddingsService(embeddingConfig);
      const semanticResults = await embeddingsService.semanticSearch(
        query,
        memoriesWithEmbeddings,
        10
      );

      if (semanticResults.length > 0) {
        return semanticResults;
      }
    } catch (error) {
      console.warn(
        "Semantic search failed, falling back to text search:",
        error
      );
    }
  }

  // Fallback to simple text search
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
