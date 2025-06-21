// Chat functionality for Browser AI Memory extension
import OpenAI from "openai";
import { EmbeddingsService } from "./embeddings";
import type { EmbeddingConfig, Memory } from "./types/memory";

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
  private openai: OpenAI | null = null;

  constructor(updateStatus: (message: string) => void) {
    this.updateStatus = updateStatus;

    // Initialize embeddings service with default config
    const embeddingConfig: EmbeddingConfig = {
      model: "openai",
      dimensions: 1536,
      maxTokens: 500,
      chunkOverlap: 50
    };
    this.embeddingsService = new EmbeddingsService(embeddingConfig);
  }

  // Initialize OpenAI client
  private async initOpenAI(): Promise<OpenAI> {
    if (this.openai) return this.openai;

    const settings = await chrome.storage.local.get(["settings"]);
    const apiKey = settings.settings?.apiKey;

    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    return this.openai;
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
        "I apologize, but I encountered an error. Please make sure your OpenAI API key is configured correctly in settings."
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

  // Generate AI response using OpenAI with RAG
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
          const relevantMemories = await this.embeddingsService.semanticSearch(
            userMessage,
            memories,
            20 // Get top 5 most relevant memories
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

      // Initialize OpenAI client
      const openai = await this.initOpenAI();

      // Prepare chat messages with context
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
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
        "📤 Sending request to OpenAI with",
        messages.length,
        "messages"
      );

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
        stream: false
      });

      const response =
        completion.choices[0]?.message?.content ||
        "I apologize, but I couldn't generate a response. Please try again.";

      console.log("✅ Received AI response, length:", response.length);
      return response;
    } catch (error) {
      console.error("❌ AI response generation failed:", error);

      if (error instanceof Error) {
        if (error.message.includes("API key")) {
          return "Please configure your OpenAI API key in the extension settings to use the chat feature.";
        } else if (
          error.message.includes("quota") ||
          error.message.includes("billing")
        ) {
          return "It looks like you've reached your OpenAI API quota or there's a billing issue. Please check your OpenAI account.";
        } else if (error.message.includes("rate limit")) {
          return "API rate limit reached. Please wait a moment before sending another message.";
        }
      }

      return "I encountered an error while generating a response. Please try again, and make sure your OpenAI API key is configured correctly.";
    }
  }

  // Clear chat history (start new chat)
  clearChat(): void {
    if (
      confirm("Start a new chat? This will clear the current conversation.")
    ) {
      this.chatHistory = [];
      if (this.chatMessages) {
        this.chatMessages.innerHTML = "";
      }
      this.initializeChat(); // Add welcome message back
      this.updateStatus("New chat started");
    }
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

  // Escape HTML to prevent XSS
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
