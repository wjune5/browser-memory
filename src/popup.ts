/// <reference types="chrome"/>
import { ChatManager } from "./chat";
import { ChatUI } from "./chatUI";
import { EmbeddingsService, EmbeddingsStorage } from "./embeddings";
import { queryRewriteAgent } from "./query-agent/queryRewriteAgent";
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
const autoSaveToggleBtn = document.getElementById(
  "autoSaveToggleBtn"
) as HTMLButtonElement;
const autoSaveStatus = document.getElementById(
  "autoSaveStatus"
) as HTMLSpanElement;
const apiKeyInput = document.getElementById("apiKeyInput") as HTMLInputElement;
const enhancedBackendToggle = document.getElementById(
  "enhancedBackendToggle"
) as HTMLInputElement;
const backendEndpointInput = document.getElementById(
  "backendEndpointInput"
) as HTMLInputElement;
const backendEndpointGroup = document.getElementById(
  "backendEndpointGroup"
) as HTMLDivElement;
const loadingBar = document.getElementById("loadingBar") as HTMLDivElement;
const status = document.getElementById("status") as HTMLDivElement;

// Chat and UI managers
let chatManager: ChatManager;
let chatUI: ChatUI;

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  loadRecentMemories();
  loadSettings();
  updateStatus("Ready");
  updateStorageInfo(); // Show storage usage

  // Initialize chat functionality
  chatManager = new ChatManager(
    updateStatus,
    showLoadingBar,
    hideLoadingBar,
    updateLoadingText
  );
  chatUI = new ChatUI(updateStatus, () => chatManager.focusChatInput());

  chatManager.initializeChat();
  chatUI.initialize();
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
autoSaveToggleBtn.addEventListener("click", handleAutoSaveButtonToggle);
apiKeyInput.addEventListener("change", handleApiKeyChange);
enhancedBackendToggle.addEventListener("change", handleEnhancedBackendToggle);
backendEndpointInput.addEventListener("change", handleBackendEndpointChange);

// Search functionality
async function handleSearch(): Promise<void> {
  const originalQuery = searchInput.value.trim();
  if (!originalQuery) return;

  updateStatus("Rewriting query...");

  try {
    // Get API key from settings
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || {};
    const apiKey = settings.apiKey;

    // Use query rewrite agent to optimize the search query
    const rewrittenQuery = await queryRewriteAgent(originalQuery, apiKey);

    console.log(`Original query: "${originalQuery}"`);
    console.log(`Rewritten query: "${rewrittenQuery}"`);

    updateStatus("Searching...");

    // Use the rewritten query for search
    const results = await searchMemories(rewrittenQuery);
    displaySearchResults(results, originalQuery, rewrittenQuery);

    // Show both original and rewritten query in status
    if (originalQuery !== rewrittenQuery) {
      updateStatus(
        `Found ${results.length} results (rewritten: "${rewrittenQuery}")`
      );
    } else {
      updateStatus(`Found ${results.length} results`);
    }
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
    return memories
      .slice(0, 10)
      .map((memory) => ({ ...memory, relevanceScore: 1 }));
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
    const memories: Memory[] = result.memories || [];
    displayMemories(memories);
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
      (memory) => `
        <div class="memory-item" data-id="${memory.id}">
            <div style="font-weight: bold; margin-bottom: 4px;">
                <a href="${escapeHtml(
                  memory.url
                )}" target="_blank" class="memory-link"> 
                ${escapeHtml(memory.title)}
                </a>
            </div>
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">
                ${new Date(memory.timestamp).toLocaleDateString()}
            </div>
        </div>
    `
    )
    .join("");
}

function displaySearchResults(
  results: SearchResult[],
  originalQuery?: string,
  rewrittenQuery?: string
): void {
  if (results.length === 0) {
    memoryList.innerHTML = '<div class="memory-item">No results found</div>';
    return;
  }

  // If we have query rewrite info, show it
  if (originalQuery && rewrittenQuery && originalQuery !== rewrittenQuery) {
    const queryInfo = `
      <div class="memory-item" style="background-color: #f0f8ff; border-left: 3px solid #007acc; padding: 8px; margin-bottom: 10px;">
        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
          <strong>Query Rewrite:</strong>
        </div>
        <div style="font-size: 11px; color: #333;">
          <span style="color: #666;">Original:</span> "${escapeHtml(
            originalQuery
          )}"
        </div>
        <div style="font-size: 11px; color: #333;">
          <span style="color: #007acc;">Rewritten:</span> "${escapeHtml(
            rewrittenQuery
          )}"
        </div>
      </div>
    `;
    memoryList.innerHTML = queryInfo + displayMemoriesHTML(results);
  } else {
    displayMemories(results);
  }
}

// Helper function to generate HTML for memories
function displayMemoriesHTML(memories: Memory[]): string {
  if (memories.length === 0) {
    return '<div class="memory-item">No memories stored yet</div>';
  }

  return memories
    .map(
      (memory) => `
        <div class="memory-item" data-id="${memory.id}">
            <div style="font-weight: bold; margin-bottom: 4px;">
                <a href="${escapeHtml(
                  memory.url
                )}" target="_blank" class="memory-link"> 
                ${escapeHtml(memory.title)}
                </a>
            </div>
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">
                ${new Date(memory.timestamp).toLocaleDateString()}
            </div>
        </div>
    `
    )
    .join("");
}

async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || {
      autoSave: true,
      useEnhancedBackend: false,
      backendEndpoint: ""
    };
    autoSaveToggle.checked = settings.autoSave;
    apiKeyInput.value = settings.apiKey || "";
    enhancedBackendToggle.checked = settings.useEnhancedBackend || false;
    backendEndpointInput.value = settings.backendEndpoint || "";

    // Update the auto-save button UI to match the checkbox
    updateAutoSaveUI();

    // Show/hide backend endpoint based on toggle
    updateBackendEndpointVisibility();
  } catch (error) {
    console.error("Error loading settings:", error);
    autoSaveToggle.checked = true; // Default to enabled
    apiKeyInput.value = "";
    enhancedBackendToggle.checked = false;
    backendEndpointInput.value = "";

    // Update the auto-save button UI with default value
    updateAutoSaveUI();
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

    // Update the button UI to match the checkbox
    updateAutoSaveUI();

    // Clear status after 2 seconds
    setTimeout(() => updateStatus("Ready"), 2000);
  } catch (error) {
    console.error("Error updating auto-save setting:", error);
    updateStatus("Failed to update settings");
  }
}

async function handleAutoSaveButtonToggle(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || {};

    // Toggle the current state
    settings.autoSave = !settings.autoSave;

    await chrome.storage.local.set({ settings });

    updateStatus(
      settings.autoSave ? "Auto-save enabled" : "Auto-save disabled"
    );

    // Update both the checkbox and button UI
    autoSaveToggle.checked = settings.autoSave;
    updateAutoSaveUI();

    // Clear status after 2 seconds
    setTimeout(() => updateStatus("Ready"), 2000);
  } catch (error) {
    console.error("Error updating auto-save setting:", error);
    updateStatus("Failed to update settings");
  }
}

function updateAutoSaveUI(): void {
  if (autoSaveStatus) {
    autoSaveStatus.textContent = autoSaveToggle.checked ? "ON" : "OFF";
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

async function handleEnhancedBackendToggle(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || {};

    settings.useEnhancedBackend = enhancedBackendToggle.checked;

    await chrome.storage.local.set({ settings });

    updateStatus(
      enhancedBackendToggle.checked
        ? "Enhanced backend enabled"
        : "Enhanced backend disabled"
    );

    // Show/hide endpoint input based on toggle
    updateBackendEndpointVisibility();

    // Clear status after 2 seconds
    setTimeout(() => updateStatus("Ready"), 2000);
  } catch (error) {
    console.error("Error updating enhanced backend setting:", error);
    updateStatus("Failed to update settings");
  }
}

async function handleBackendEndpointChange(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(["settings"]);
    const settings = result.settings || {};

    settings.backendEndpoint = backendEndpointInput.value.trim();

    await chrome.storage.local.set({ settings });

    if (settings.backendEndpoint) {
      updateStatus("Backend endpoint saved");
    } else {
      updateStatus("Backend endpoint cleared");
    }

    // Clear status after 2 seconds
    setTimeout(() => updateStatus("Ready"), 2000);
  } catch (error) {
    console.error("Error updating backend endpoint:", error);
    updateStatus("Failed to save backend endpoint");
  }
}

function updateBackendEndpointVisibility(): void {
  if (enhancedBackendToggle.checked) {
    backendEndpointGroup.style.display = "block";
  } else {
    backendEndpointGroup.style.display = "none";
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

// Loading bar functions
function showLoadingBar(): void {
  if (loadingBar) {
    loadingBar.classList.remove("hidden");
  }
}

function hideLoadingBar(): void {
  if (loadingBar) {
    loadingBar.classList.add("hidden");
  }
}

function updateLoadingText(text: string): void {
  const loadingText = loadingBar?.querySelector(".loading-text");
  if (loadingText) {
    loadingText.textContent = text;
  }
}
