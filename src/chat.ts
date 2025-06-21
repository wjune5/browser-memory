// Chat functionality for Browser AI Memory extension

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

  constructor(updateStatus: (message: string) => void) {
    this.updateStatus = updateStatus;
  }

  // Initialize chat elements
  initializeElements(): void {
    this.chatMessages = document.getElementById("chatMessages") as HTMLDivElement;
    this.chatInput = document.getElementById("chatInput") as HTMLInputElement;
    this.sendBtn = document.getElementById("sendBtn") as HTMLButtonElement;
    this.clearChatBtn = document.getElementById("clearChat") as HTMLButtonElement;
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
    this.addChatMessage("ai", "Hello! I'm your AI assistant. How can I help you today?");
  }

  // Handle sending a message
  handleSendMessage(): void {
    if (!this.chatInput) return;
    
    const message = this.chatInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    this.addChatMessage("user", message);
    this.chatInput.value = "";
    
    // Show typing indicator
    this.updateStatus("AI is thinking...");
    
    // Simulate AI response (replace with actual AI integration)
    setTimeout(() => {
      const aiResponse = this.generateAIResponse(message);
      this.addChatMessage("ai", aiResponse);
      this.updateStatus("Chat mode");
    }, 1000);
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

  // Generate AI response (placeholder - replace with actual AI integration)
  generateAIResponse(userMessage: string): string {
    // Placeholder AI response - replace with actual AI integration
    const responses = [
      "That's an interesting question! I'd be happy to help you with that.",
      "I understand what you're asking. Let me think about the best way to approach this.",
      "Thanks for sharing that with me. I can definitely assist you with this topic.",
      "I see what you mean. This is something I can help you explore further.",
      "That's a great point! I'd love to discuss this more with you."
    ];
    
    // Simple keyword-based responses
    if (userMessage.toLowerCase().includes("hello") || userMessage.toLowerCase().includes("hi")) {
      return "Hello! How can I assist you today?";
    }
    
    if (userMessage.toLowerCase().includes("help")) {
      return "I'm here to help! You can ask me questions, have a conversation, or just chat. What would you like to know?";
    }
    
    if (userMessage.toLowerCase().includes("thank")) {
      return "You're welcome! I'm glad I could help. Is there anything else you'd like to discuss?";
    }
    
    // Return random response for other messages
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex] || "I'm here to help! What would you like to know?";
  }

  // Clear chat history
  clearChat(): void {
    if (confirm("Are you sure you want to clear the chat history?")) {
      this.chatHistory = [];
      if (this.chatMessages) {
        this.chatMessages.innerHTML = "";
      }
      this.initializeChat(); // Add welcome message back
      this.updateStatus("Chat cleared");
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
