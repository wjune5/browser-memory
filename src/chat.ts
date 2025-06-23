// Chat functionality for Browser AI Memory extension
import OpenAI from "openai";
import { EmbeddingsService } from "./embeddings";
import type {
  EmbeddingConfig,
  Memory,
  SemanticSearchResult
} from "./types/memory";

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
  private showLoadingBar: () => void;
  private hideLoadingBar: () => void;
  private updateLoadingText: (text: string) => void;
  private embeddingsService: EmbeddingsService;
  private openai: OpenAI | null = null;

  constructor(
    updateStatus: (message: string) => void,
    showLoadingBar: () => void,
    hideLoadingBar: () => void,
    updateLoadingText: (text: string) => void
  ) {
    this.updateStatus = updateStatus;
    this.showLoadingBar = showLoadingBar;
    this.hideLoadingBar = hideLoadingBar;
    this.updateLoadingText = updateLoadingText;

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

  // Generate AI response using smart hybrid approach
  async generateAIResponse(userMessage: string): Promise<string> {
    try {
      console.log("🤖 Generating AI response for:", userMessage);

      // Get stored memories for RAG context
      const result = await chrome.storage.local.get(["memories"]);
      const memories: Memory[] = result.memories || [];

      console.log("📚 Found", memories.length, "memories for context");

      // Use semantic search to find relevant memories
      let relevantMemories: SemanticSearchResult[] = [];
      if (memories.length > 0) {
        try {
          relevantMemories = await this.embeddingsService.semanticSearch(
            userMessage,
            memories,
            5 // Get top 5 most relevant memories
          );
          console.log("🔍 Found", relevantMemories.length, "relevant memories");
        } catch (searchError) {
          console.warn("⚠️ Semantic search failed:", searchError);
          // Fallback: use recent memories as SemanticSearchResult
          relevantMemories = memories.slice(0, 5).map((memory) => ({
            ...memory,
            similarity: 0.5 // Default similarity for fallback
          }));
        }
      }

      // Try enhanced backend first (smart detection)
      const enhancedResponse = await this.tryEnhancedBackend(
        userMessage,
        relevantMemories
      );
      if (enhancedResponse) {
        console.log("✅ Using enhanced multi-agent response");
        return enhancedResponse;
      }

      // Fallback to direct OpenAI with local RAG
      console.log("📡 Falling back to direct OpenAI");
      return await this.generateDirectAIResponse(userMessage, relevantMemories);
    } catch (error) {
      console.error("❌ AI response generation failed:", error);
      return "I encountered an error while generating a response. Please try again.";
    }
  }

  // Try enhanced backend (uses settings configuration)
  private async tryEnhancedBackend(
    userMessage: string,
    relevantMemories: SemanticSearchResult[]
  ): Promise<string | null> {
    try {
      // Check user settings for enhanced backend configuration
      const result = await chrome.storage.local.get(["settings"]);
      const settings = result.settings || {};

      if (!settings.useEnhancedBackend) {
        console.log("🔒 Enhanced backend disabled in settings");
        return null;
      }

      if (!settings.backendEndpoint) {
        console.log("⚠️ No backend endpoint configured");
        return null;
      }

      // Try to warm up the backend first (quick health check)
      try {
        console.log("🌡️ Warming up backend...");
        this.showLoadingBar();
        this.updateLoadingText("🌡️ Warming up backend...");

        await fetch(`${settings.backendEndpoint}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(30000) // 30 seconds for cold start warmup
        });
        console.log("✅ Backend is warm");
        this.updateLoadingText("🤖 Processing with multi-agent AI...");
      } catch (warmupError) {
        console.log("⚠️ Backend warmup failed, continuing anyway");
        this.updateLoadingText("🤖 Processing with multi-agent AI...");
      }

      const requestData = {
        query: userMessage,
        relevantMemories: relevantMemories.map((memory) => ({
          title: memory.title || "Untitled",
          content: memory.content?.substring(0, 200) || "", // Reduced from 500 to 200 for faster processing
          url: memory.url,
          similarity: memory.similarity || 0
        })),
        userContext: this.getChatContext()
      };

      // Validate userContext format
      const userContext = this.getChatContext();
      console.log(
        "🔍 UserContext type:",
        typeof userContext,
        "Array:",
        Array.isArray(userContext)
      );
      console.log("🔍 UserContext content:", userContext);

      console.log("🚀 Trying enhanced backend:", settings.backendEndpoint);
      console.log("📤 Request data:", JSON.stringify(requestData, null, 2));

      // Show loading bar and update user with status (already shown during warmup)
      this.updateStatus("🤖 Processing with multi-agent AI...");

      const startTime = Date.now();
      const response = await fetch(`${settings.backendEndpoint}/enhance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(requestData),
        signal: AbortSignal.timeout(300000) // Increased to 5 minute timeout for multi-agent processing
      });

      const requestTime = Date.now() - startTime;
      console.log(
        `📥 Response received in ${requestTime}ms, status:`,
        response.status
      );

      // Hide loading bar and update status based on response time
      this.hideLoadingBar();
      if (requestTime > 60000) {
        this.updateStatus(
          "⚡ Enhanced processing complete (very long processing)"
        );
      } else if (requestTime > 10000) {
        this.updateStatus("⚡ Enhanced processing complete (slow response)");
      } else {
        this.updateStatus("⚡ Enhanced processing complete");
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Backend error response:", errorText);
        throw new Error(
          `Backend responded with ${response.status}: ${errorText}`
        );
      }

      const data = await response.json();
      console.log("✅ Backend response data:", data);

      if (data.enhancedResponse) {
        // Add insights if available
        let finalResponse = data.enhancedResponse;
        if (data.agentInsights) {
          finalResponse += `\n\n💡 *Enhanced Analysis: Found ${
            data.agentInsights.memoriesAnalyzed
          } relevant memories with ${(
            data.agentInsights.averageRelevance * 100
          ).toFixed(0)}% average relevance*`;
        }
        return finalResponse;
      }

      return null;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("🔄 Enhanced backend error details:", error);

      // Hide loading bar on error
      this.hideLoadingBar();

      console.log(
        "🔄 Enhanced backend unavailable, using fallback:",
        errorMessage
      );
      return null;
    }
  }

  // Direct AI response (fallback)
  private async generateDirectAIResponse(
    userMessage: string,
    relevantMemories: SemanticSearchResult[]
  ): Promise<string> {
    // Build context from relevant memories
    let contextualInfo = "";
    if (relevantMemories.length > 0) {
      contextualInfo = "\n\nRelevant information from your browsing history:\n";
      relevantMemories.forEach((memory, index) => {
        contextualInfo += `\n${index + 1}. ${memory.title || "Untitled"}\n`;
        contextualInfo += `   URL: ${memory.url}\n`;
        if (memory.content) {
          const content =
            memory.content.length > 500
              ? memory.content.substring(0, 500) + "..."
              : memory.content;
          contextualInfo += `   Content: ${content}\n`;
        }
        contextualInfo += `   Similarity: ${(memory.similarity * 100).toFixed(
          1
        )}%\n`;
      });
    }

    // Initialize OpenAI client
    const openai = await this.initOpenAI();

    // Prepare chat messages with context
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are QuickSeek, a helpful AI assistant with access to the user's browsing history and saved web content. Use the provided context to give relevant and informed responses. If the context contains relevant information, reference it naturally in your response.${contextualInfo}`
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

    console.log("✅ Received direct AI response, length:", response.length);
    return response;
  }

  // Get chat context for backend
  private getChatContext(): string[] {
    const recentHistory = this.chatHistory.slice(-4);
    return recentHistory.map((msg) => `${msg.role}: ${msg.message}`);
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
