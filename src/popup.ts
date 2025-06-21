/// <reference types="chrome"/>
import { EmbeddingsService, EmbeddingsStorage } from "./embeddings";
import type { EmbeddingConfig, Memory, SearchResult } from "./types/memory";

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
const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const status = document.getElementById("status") as HTMLDivElement;

// Infinite scroll state
let currentMemories: Memory[] = [];
let currentSearchResults: SearchResult[] = [];
let loadedCount = 0;
let isSearchMode = false;
let isLoading = false;
const MEMORIES_PER_PAGE = 10;

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  loadRecentMemories();
  loadSettings();
  updateStatus("Ready");
  updateStorageInfo(); // Show storage usage
});

// Event listeners
searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("keypress", (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    handleSearch();
  }
});

// Listen for input changes to detect when search field is cleared
searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim();
  if (!query) {
    // Restore default memory list when search is cleared
    loadRecentMemories();
    updateStatus("Ready");
  }
});

saveCurrentPageBtn.addEventListener("click", saveCurrentPage);
clearMemoryBtn.addEventListener("click", clearMemory);
autoSaveToggle.addEventListener("change", handleAutoSaveToggle);
apiKeyInput.addEventListener("change", handleApiKeyChange);

// Infinite scroll listener
memoryList.addEventListener("scroll", handleScroll);

// Event delegation for memory URL clicks
memoryList.addEventListener("click", handleMemoryClick);

// Infinite scroll handler
async function handleScroll(): Promise<void> {
  if (isLoading) return;

  const { scrollTop, scrollHeight, clientHeight } = memoryList;
  const scrolledToBottom = scrollTop + clientHeight >= scrollHeight - 5;

  if (scrolledToBottom) {
    if (isSearchMode) {
      await loadMoreSearchResults();
    } else {
      await loadMoreMemories();
    }
  }
}

// Search functionality
async function handleSearch(): Promise<void> {
  const query = searchInput.value.trim();

  if (!query) {
    // Restore default memory list when search is empty
    isSearchMode = false;
    loadedCount = 0;
    await loadRecentMemories();
    updateStatus("Ready");
    return;
  }

  updateStatus("Searching...");
  isSearchMode = true;
  loadedCount = 0;

  try {
    currentSearchResults = await searchMemories(query);
    displaySearchResults(currentSearchResults.slice(0, MEMORIES_PER_PAGE));
    loadedCount = Math.min(MEMORIES_PER_PAGE, currentSearchResults.length);
    updateStatus(`Found ${currentSearchResults.length} results`);
  } catch (error) {
    console.error("Search error:", error);
    updateStatus("Search failed");
  }
}

// Load more search results for infinite scroll
async function loadMoreSearchResults(): Promise<void> {
  if (loadedCount >= currentSearchResults.length) return;

  isLoading = true;
  showLoadingIndicator();

  const nextBatch = currentSearchResults.slice(
    loadedCount,
    loadedCount + MEMORIES_PER_PAGE
  );

  if (nextBatch.length > 0) {
    appendSearchResults(nextBatch);
    loadedCount += nextBatch.length;
  }

  hideLoadingIndicator();
  isLoading = false;
}

// Load more memories for infinite scroll
async function loadMoreMemories(): Promise<void> {
  if (loadedCount >= currentMemories.length) return;

  isLoading = true;
  showLoadingIndicator();

  const nextBatch = currentMemories.slice(
    loadedCount,
    loadedCount + MEMORIES_PER_PAGE
  );

  if (nextBatch.length > 0) {
    appendMemories(nextBatch);
    loadedCount += nextBatch.length;
  }

  hideLoadingIndicator();
  isLoading = false;
}

function showLoadingIndicator(): void {
  const existingIndicator = document.getElementById("loading-indicator");
  if (!existingIndicator) {
    const loadingHTML =
      '<div id="loading-indicator" class="memory-item" style="text-align: center; color: #666;">Loading more memories...</div>';
    memoryList.insertAdjacentHTML("beforeend", loadingHTML);
  }
}

function hideLoadingIndicator(): void {
  const indicator = document.getElementById("loading-indicator");
  if (indicator) {
    indicator.remove();
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
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings;

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
              chunk.embedding = await embeddingsService.generateEmbedding(
                chunk.content
              );
              memory.chunks.push(chunk);
            } catch (chunkError) {
              console.warn(
                "Failed to generate embedding for chunk:",
                chunkError
              );
              memory.chunks.push(chunk); // Store chunk without embedding
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
    const result = await chrome.storage.local.get(["memories"]);
    const memories: Memory[] = result.memories || [];
    memories.unshift(memory);
    const trimmedMemories = memories.slice(0, 100);
    await chrome.storage.local.set({ memories: trimmedMemories });
  }
}

async function searchMemories(query: string): Promise<SearchResult[]> {
  const result = await chrome.storage.local.get(["memories", "settings"]);
  const memories: Memory[] = result.memories || [];
  const settings = result.settings;

  if (!query.trim()) {
    return memories.map((memory) => ({ ...memory, relevanceScore: 1 }));
  }

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
        return semanticResults.map((result) => ({
          ...result,
          relevanceScore: result.similarity
        }));
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
    currentMemories = result.memories || [];
    loadedCount = Math.min(MEMORIES_PER_PAGE, currentMemories.length);
    displayMemories(currentMemories.slice(0, loadedCount));
  } catch (error) {
    console.error("Load error:", error);
    memoryList.innerHTML =
      '<div class="memory-item">Failed to load memories</div>';
  }
}

// Storage info function
async function updateStorageInfo(): Promise<void> {
  try {
    const storageInfo = await EmbeddingsStorage.getStorageInfo();
    const usedKB = Math.round(storageInfo.used / 1024);
    const totalKB = Math.round(storageInfo.total / 1024);
    const percentage = Math.round((storageInfo.used / storageInfo.total) * 100);

    console.log(`Storage: ${usedKB}KB / ${totalKB}KB (${percentage}%)`);

    // Update status with storage info if usage is high
    if (percentage > 80) {
      updateStatus(`Storage: ${percentage}% full (${usedKB}KB used)`);
    }
  } catch (error) {
    console.warn("Failed to get storage info:", error);
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
      (memory) => `        <div class="memory-item" data-id="${memory.id}">
            <div style="font-weight: bold; margin-bottom: 4px;">${escapeHtml(
              memory.title
            )}</div>
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">
                ${new Date(memory.timestamp).toLocaleDateString()}
            </div>
            <div style="font-size: 12px;">
                <a href="#" class="memory-url" data-url="${escapeHtml(
                  memory.url
                )}" 
                   style="color: #1a73e8; text-decoration: none; cursor: pointer;"
                   title="${escapeHtml(memory.url)}">
                    ${escapeHtml(
                      memory.url.length > 50
                        ? memory.url.substring(0, 50) + "..."
                        : memory.url
                    )}
                </a>
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

function appendSearchResults(results: SearchResult[]): void {
  appendMemories(results);
}

function appendMemories(memories: Memory[]): void {
  const memoryHTML = memories
    .map(
      (memory) => `        <div class="memory-item" data-id="${memory.id}">
            <div style="font-weight: bold; margin-bottom: 4px;">${escapeHtml(
              memory.title
            )}</div>
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">
                ${new Date(memory.timestamp).toLocaleDateString()}
            </div>
            <div style="font-size: 12px;">
                <a href="#" class="memory-url" data-url="${escapeHtml(
                  memory.url
                )}" 
                   style="color: #1a73e8; text-decoration: none; cursor: pointer;"
                   title="${escapeHtml(memory.url)}">
                    ${escapeHtml(
                      memory.url.length > 50
                        ? memory.url.substring(0, 50) + "..."
                        : memory.url
                    )}
                </a>
            </div>
        </div>
    `
    )
    .join("");

  memoryList.insertAdjacentHTML("beforeend", memoryHTML);
}

async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || { autoSave: true };
    autoSaveToggle.checked = settings.autoSave;
    apiKeyInput.value = settings.apiKey || "";
  } catch (error) {
    console.error("Error loading settings:", error);
    autoSaveToggle.checked = true; // Default to enabled
    apiKeyInput.value = "";
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

async function handleApiKeyChange(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || {};

    settings.apiKey = apiKeyInput.value.trim();

    await chrome.storage.local.set({ settings });

    if (settings.apiKey) {
      updateStatus("API key saved");
    } else {
      updateStatus("API key cleared");
    }

    // Clear status after 2 seconds
    setTimeout(() => updateStatus("Ready"), 2000);
  } catch (error) {
    console.error("Error updating API key:", error);
    updateStatus("Failed to save API key");
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

// Handle clicks on memory items (specifically URL links)
async function handleMemoryClick(event: Event): Promise<void> {
  const target = event.target as HTMLElement;

  // Check if the clicked element is a memory URL link
  if (target.classList.contains("memory-url")) {
    event.preventDefault();

    const url = target.getAttribute("data-url");
    if (url) {
      try {
        // Open the URL in a new tab
        await chrome.tabs.create({ url: url });
        updateStatus("Opening page...");

        // Clear status after 2 seconds
        setTimeout(() => updateStatus("Ready"), 2000);
      } catch (error) {
        console.error("Error opening URL:", error);
        updateStatus("Failed to open page");
      }
    }
  }
}
