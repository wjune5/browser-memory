// Chat functionality for Browser AI Memory extension
import { AIService } from "./ai-service";
import { EmbeddingsService } from "./embeddings";
import type { EmbeddingConfig, Memory, ExtensionSettings } from "./types/memory";

// Declare chrome for browser extension context
declare const chrome: any;

// Chat state
export interface ChatMessage {
  role: "user" | "ai";
  message: string;
  timestamp: string;
}

export class ChatManager {
  private chatHistory: ChatMessage[] = [];
  private chatMessages: HTMLDivElement | null = null;
  private chatInput: HTMLInputElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private clearChatBtn: HTMLButtonElement | null = null;
  private updateStatus: (message: string) => void;
  private embeddingsService: EmbeddingsService;
  private aiService: AIService | null = null;
  private settings: ExtensionSettings | null = null;

  constructor(updateStatus: (message: string) => void) {
    this.updateStatus = updateStatus;

    // Initialize embeddings service with default config
    const embeddingConfig: EmbeddingConfig = {
      model: "local",
      dimensions: 384,
      maxTokens: 500,
      chunkOverlap: 50
    };
    const defaultSettings: ExtensionSettings = {
      aiProvider: "local",
      embeddingModel: "local",
      chatModel: "local",
      queryRewriteModel: "local",
      autoSave: false,
      maxMemories: 100
    };
    this.embeddingsService = new EmbeddingsService(embeddingConfig, defaultSettings);
  }

  // Initialize AI service with current settings
  private async initAIService(): Promise<AIService> {
    if (this.aiService && this.settings) return this.aiService;

    const result = await chrome.storage.local.get(["settings"]);
    const defaultSettings: ExtensionSettings = {
      aiProvider: "local",
      embeddingModel: "local",
      chatModel: "local",
      queryRewriteModel: "local",
      autoSave: false,
      maxMemories: 100
    };
    this.settings = result.settings || defaultSettings;
    
    this.aiService = new AIService(this.settings!);
    return this.aiService;
  }

  // Initialize chat elements
  initializeElements(): void {
    this.chatMessages = document.getElementById(
      "chatMessages"
    ) as HTMLDivElement;
    this.chatInput = document.getElementById("chatInput") as HTMLInputElement;
    this.sendBtn = document.getElementById("sendBtn") as HTMLButtonElement;
    this.clearChatBtn = document.getElementById(
      "newChatBtn"
    ) as HTMLButtonElement;
  }

  // Set up event listeners
  setupEventListeners(): void {
    if (this.sendBtn) {
      this.sendBtn.addEventListener("click", () => this.handleSendMessage());
    }

    if (this.chatInput) {
      this.chatInput.addEventListener("keypress", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          this.handleSendMessage();
        }
      });
    }

    if (this.clearChatBtn) {
      this.clearChatBtn.addEventListener("click", () => this.clearChat());
    }
  }

  // Initialize chat interface
  initializeChat(): void {
    this.initializeElements();
    this.setupEventListeners();
    this.addChatMessage(
      "ai",
      "Hello! I'm your AI assistant with access to your browsing memory. How can I help you today?"
    );
  }

  // Handle sending a message
  async handleSendMessage(): Promise<void> {
    if (!this.chatInput) return;

    const message = this.chatInput.value.trim();
    if (!message) return;

    // Add user message to chat
    this.addChatMessage("user", message);
    this.chatInput.value = "";

    // Disable input while processing
    if (this.chatInput) this.chatInput.disabled = true;
    if (this.sendBtn) this.sendBtn.disabled = true;

    try {
      // Show typing indicator
      this.updateStatus("AI is thinking...");

      // Generate AI response with RAG
      const aiResponse = await this.generateAIResponse(message);
      this.addChatMessage("ai", aiResponse);
      this.updateStatus("Chat mode");
    } catch (error) {
      console.error("Chat error:", error);
      this.addChatMessage(
        "ai",
        "I apologize, but I encountered an error. Please make sure your AI provider is configured correctly in settings."
      );
      this.updateStatus("Error occurred");
    } finally {
      // Re-enable input
      if (this.chatInput) this.chatInput.disabled = false;
      if (this.sendBtn) this.sendBtn.disabled = false;
      if (this.chatInput) this.chatInput.focus();
    }
  }

  // Add a message to the chat
  addChatMessage(role: "user" | "ai", message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.chatHistory.push({ role, message, timestamp });

    if (!this.chatMessages) return;

    const messageElement = document.createElement("div");
    messageElement.className = `chat-message ${role}`;
    messageElement.innerHTML = `
      <div class="message-content">${this.escapeHtml(message)}</div>
      <div class="message-time" style="font-size: 10px; opacity: 0.7; margin-top: 4px;">
        ${timestamp}
      </div>
    `;

    this.chatMessages.appendChild(messageElement);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  // Generate AI response using selected provider with RAG
  async generateAIResponse(userMessage: string): Promise<string> {
    try {
      console.log("🤖 Generating AI response for:", userMessage);

      // Get stored memories for RAG context
      const result = await chrome.storage.local.get(["memories"]);
      const memories: Memory[] = result.memories || [];

      console.log("📚 Found", memories.length, "memories for context");

      let contextualInfo = "";

      // Use semantic search to find relevant memories if available
      if (memories.length > 0) {
        try {
          // Update embeddings service with current settings
          const settings = await this.getCurrentSettings();
          const embeddingConfig: EmbeddingConfig = {
            model: settings?.embeddingModel || "local",
            dimensions: settings?.embeddingModel === "openai" ? 1536 : 384,
            maxTokens: 500,
            chunkOverlap: 50
          };
          const currentSettings = settings || {
            aiProvider: "local",
            embeddingModel: "local",
            chatModel: "local",
            queryRewriteModel: "local",
            autoSave: false,
            maxMemories: 100
          };
          this.embeddingsService = new EmbeddingsService(embeddingConfig, currentSettings);

          const relevantMemories = await this.embeddingsService.semanticSearch(
            userMessage,
            memories,
            20 // Get top 20 most relevant memories
          );

          console.log("🔍 Found", relevantMemories.length, "relevant memories");

          if (relevantMemories.length > 0) {
            contextualInfo =
              "\n\nRelevant information from your browsing history:\n";
            relevantMemories.forEach((memory, index) => {
              contextualInfo += `\n${index + 1}. ${
                memory.title || "Untitled"
              }\n`;
              contextualInfo += `   URL: ${memory.url}\n`;
              if (memory.content) {
                // Limit content length to avoid token limits
                const content =
                  memory.content.length > 500
                    ? memory.content.substring(0, 500) + "..."
                    : memory.content;
                contextualInfo += `   Content: ${content}\n`;
              }
              contextualInfo += `   Similarity: ${(
                memory.similarity * 100
              ).toFixed(1)}%\n`;
            });
          }
        } catch (searchError) {
          console.warn(
            "⚠️ Semantic search failed, using fallback:",
            searchError
          );
          // Fallback: use recent memories if semantic search fails
          const recentMemories = memories.slice(0, 10);
          if (recentMemories.length > 0) {
            contextualInfo = "\n\nRecent browsing history:\n";
            recentMemories.forEach((memory, index) => {
              contextualInfo += `\n${index + 1}. ${
                memory.title || "Untitled"
              }\n`;
              contextualInfo += `   URL: ${memory.url}\n`;
              if (memory.content) {
                const content =
                  memory.content.length > 500
                    ? memory.content.substring(0, 500) + "..."
                    : memory.content;
                contextualInfo += `   Content: ${content}\n`;
              }
            });
          }
        }
      }

      // Initialize AI service with current settings
      const aiService = await this.initAIService();

      // Prepare chat messages with context
      const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
        {
          role: "system",
          content: `You are a helpful AI assistant with access to the user's browsing history and saved web content. Use the provided context to give relevant and informed responses. If the context contains relevant information, reference it naturally in your response. If the context isn't relevant, still provide a helpful response based on your general knowledge. No need to ask user about specific timeframe, if user doesn't specify, just return all applied browsing memories.${contextualInfo}`
        }
      ];

      // Add recent chat history for context (last 6 messages)
      const recentHistory = this.chatHistory.slice(-6);
      recentHistory.forEach((msg) => {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.message
        });
      });

      // Add current user message
      messages.push({
        role: "user",
        content: userMessage
      });

      console.log(
        "📤 Sending request to AI service with",
        messages.length,
        "messages"
      );

      // Call AI service
      const response = await aiService.generateChatCompletion(messages, this.settings?.chatModel);

      console.log("✅ Received AI response, length:", response.length);
      return response;
    } catch (error) {
      console.error("❌ AI response generation failed:", error);

      if (error instanceof Error) {
        if (error.message.includes("API key")) {
          return "Please configure your AI provider API key in the extension settings to use the chat feature.";
        } else if (
          error.message.includes("quota") ||
          error.message.includes("billing")
        ) {
          return "It looks like you've reached your API quota or there's a billing issue. Please check your account.";
        } else if (error.message.includes("rate limit")) {
          return "API rate limit reached. Please wait a moment before sending another message.";
        }
      }

      return "I encountered an error while generating a response. Please try again, and make sure your AI provider is configured correctly.";
    }
  }

  // Get current settings
  private async getCurrentSettings(): Promise<ExtensionSettings | null> {
    const result = await chrome.storage.local.get(["settings"]);
    return result.settings || null;
  }

  // Clear chat history
  clearChat(): void {
    this.chatHistory = [];
    if (this.chatMessages) {
      this.chatMessages.innerHTML = "";
    }
    this.addChatMessage(
      "ai",
      "Chat history cleared. How can I help you today?"
    );
  }

  // Get chat history
  getChatHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }

  // Focus chat input
  focusChatInput(): void {
    if (this.chatInput) {
      this.chatInput.focus();
    }
  }

  // Escape HTML for safe display
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

