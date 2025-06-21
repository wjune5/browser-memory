/// <reference types="chrome"/>
import type { Memory, SearchResult } from "./types/memory";

// DOM elements with proper typing
const searchInput = document.getElementById("searchInput") as HTMLInputElement;
const searchBtn = document.getElementById("searchBtn") as HTMLButtonElement;
const memoryList = document.getElementById("memoryList") as HTMLDivElement;
const saveCurrentPageBtn = document.getElementById(
  "saveCurrentPage"
) as HTMLButtonElement;
const clearMemoryBtn = document.getElementById(
  "clearMemory"
) as HTMLButtonElement;
const autoSaveToggle = document.getElementById(
  "autoSaveToggle"
) as HTMLInputElement;
const status = document.getElementById("status") as HTMLDivElement;

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  loadRecentMemories();
  loadSettings();
  updateStatus("Ready");
});

// Event listeners
searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("keypress", (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    handleSearch();
  }
});

saveCurrentPageBtn.addEventListener("click", saveCurrentPage);
clearMemoryBtn.addEventListener("click", clearMemory);
autoSaveToggle.addEventListener("change", handleAutoSaveToggle);

// Search functionality
async function handleSearch(): Promise<void> {
  const query = searchInput.value.trim();
  if (!query) return;

  updateStatus("Searching...");

  try {
    const results = await searchMemories(query);
    displaySearchResults(results);
    updateStatus(`Found ${results.length} results`);
  } catch (error) {
    console.error("Search error:", error);
    updateStatus("Search failed");
  }
}

// Memory management
async function saveCurrentPage(): Promise<void> {
  updateStatus("Saving current page...");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab || !tab.id) {
      throw new Error("No active tab found");
    }

    // Check if it's a chrome:// or extension page
    if (
      tab.url?.startsWith("chrome://") ||
      tab.url?.startsWith("chrome-extension://")
    ) {
      throw new Error("Cannot save system pages");
    }

    let response;
    try {
      // Try to communicate with content script
      response = await chrome.tabs.sendMessage(tab.id, {
        action: "extractContent"
      });
    } catch (error) {
      // If content script is not available, use basic tab info
      console.warn(
        "Content script not available, using basic tab info:",
        error
      );
      response = {
        content: tab.title || "No content available",
        title: tab.title || "",
        url: tab.url || "",
        domain: tab.url ? new URL(tab.url).hostname : ""
      };
    }

    const memory: Omit<Memory, "tags"> = {
      id: Date.now(),
      url: tab.url || "",
      title: tab.title || "",
      content: response.content || tab.title || "No content available",
      timestamp: new Date().toISOString(),
      favicon: tab.favIconUrl,
      domain: tab.url ? new URL(tab.url).hostname : ""
    };

    await saveMemory({
      ...memory,
      tags: [] // Will be populated by background script
    });

    await loadRecentMemories();
    updateStatus("Page saved successfully");
  } catch (error) {
    console.error("Save error:", error);
    updateStatus(
      `Failed to save page: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function clearMemory(): Promise<void> {
  if (confirm("Are you sure you want to clear all memories?")) {
    try {
      await chrome.storage.local.clear();
      memoryList.innerHTML =
        '<div class="memory-item">No memories stored</div>';
      updateStatus("Memory cleared");
    } catch (error) {
      console.error("Clear error:", error);
      updateStatus("Failed to clear memory");
    }
  }
}

// Storage functions
async function saveMemory(memory: Memory): Promise<void> {
  const result = await chrome.storage.local.get(["memories"]);
  const memories: Memory[] = result.memories || [];

  memories.unshift(memory);

  // Keep only the last 100 memories
  const trimmedMemories = memories.slice(0, 100);

  await chrome.storage.local.set({ memories: trimmedMemories });
}

async function searchMemories(query: string): Promise<SearchResult[]> {
  const result = await chrome.storage.local.get(["memories"]);
  const memories: Memory[] = result.memories || [];

  // Simple text search - TODO: Implement AI-powered semantic search
  const lowercaseQuery = query.toLowerCase();
  return memories
    .filter(
      (memory: Memory): memory is SearchResult =>
        memory.title.toLowerCase().includes(lowercaseQuery) ||
        memory.content.toLowerCase().includes(lowercaseQuery) ||
        memory.url.toLowerCase().includes(lowercaseQuery)
    )
    .map((memory) => ({
      ...memory,
      relevanceScore: calculateRelevanceScore(memory, lowercaseQuery)
    }));
}

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

async function loadRecentMemories(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["memories"]);
    const memories: Memory[] = result.memories || [];
    displayMemories(memories.slice(0, 5)); // Show only recent 5
  } catch (error) {
    console.error("Load error:", error);
    memoryList.innerHTML =
      '<div class="memory-item">Failed to load memories</div>';
  }
}

// UI functions
function displayMemories(memories: Memory[]): void {
  if (memories.length === 0) {
    memoryList.innerHTML =
      '<div class="memory-item">No memories stored yet</div>';
    return;
  }

  memoryList.innerHTML = memories
    .map(
      (memory) => `
        <div class="memory-item" data-id="${memory.id}">
            <div style="font-weight: bold; margin-bottom: 4px;">${escapeHtml(
              memory.title
            )}</div>
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">
                ${new Date(memory.timestamp).toLocaleDateString()}
            </div>
            <div style="font-size: 12px; color: #888;">
                ${escapeHtml(
                  memory.url.length > 50
                    ? memory.url.substring(0, 50) + "..."
                    : memory.url
                )}
            </div>
        </div>
    `
    )
    .join("");
}

function displaySearchResults(results: SearchResult[]): void {
  if (results.length === 0) {
    memoryList.innerHTML = '<div class="memory-item">No results found</div>';
    return;
  }

  displayMemories(results);
}

async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || { autoSave: true };
    autoSaveToggle.checked = settings.autoSave;
  } catch (error) {
    console.error("Error loading settings:", error);
    autoSaveToggle.checked = true; // Default to enabled
  }
}

async function handleAutoSaveToggle(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || {};

    settings.autoSave = autoSaveToggle.checked;

    await chrome.storage.local.set({ settings });

    updateStatus(
      autoSaveToggle.checked ? "Auto-save enabled" : "Auto-save disabled"
    );

    // Clear status after 2 seconds
    setTimeout(() => updateStatus("Ready"), 2000);
  } catch (error) {
    console.error("Error updating auto-save setting:", error);
    updateStatus("Failed to update settings");
  }
}

function updateStatus(message: string): void {
  status.textContent = message;

  // Auto-clear status after 3 seconds
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "Ready";
    }
  }, 3000);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
