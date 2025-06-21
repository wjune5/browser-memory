// Chat UI management for Browser AI Memory extension

export class ChatUI {
  private searchModeBtn: HTMLButtonElement | null = null;
  private chatModeBtn: HTMLButtonElement | null = null;
  private searchSection: HTMLDivElement | null = null;
  private chatSection: HTMLDivElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private updateStatus: (message: string) => void;
  private focusChatInput: () => void;

  constructor(updateStatus: (message: string) => void, focusChatInput: () => void) {
    this.updateStatus = updateStatus;
    this.focusChatInput = focusChatInput;
  }

  // Initialize UI elements
  initializeElements(): void {
    this.searchModeBtn = document.getElementById("searchModeBtn") as HTMLButtonElement;
    this.chatModeBtn = document.getElementById("chatModeBtn") as HTMLButtonElement;
    this.searchSection = document.getElementById("searchSection") as HTMLDivElement;
    this.chatSection = document.getElementById("chatSection") as HTMLDivElement;
    this.searchInput = document.getElementById("searchInput") as HTMLInputElement;
  }

  // Set up mode toggle event listeners
  setupModeToggleListeners(): void {
    if (this.searchModeBtn) {
      this.searchModeBtn.addEventListener("click", () => this.switchMode("search"));
    }
    
    if (this.chatModeBtn) {
      this.chatModeBtn.addEventListener("click", () => this.switchMode("chat"));
    }
  }

  // Switch between search and chat modes
  switchMode(mode: "search" | "chat"): void {
    // Update button states
    if (this.searchModeBtn) {
      this.searchModeBtn.classList.toggle("active", mode === "search");
    }
    if (this.chatModeBtn) {
      this.chatModeBtn.classList.toggle("active", mode === "chat");
    }
    
    // Update section visibility
    if (this.searchSection) {
      this.searchSection.classList.toggle("active", mode === "search");
    }
    if (this.chatSection) {
      this.chatSection.classList.toggle("active", mode === "chat");
    }
    
    // Update status
    this.updateStatus(mode === "search" ? "Search mode" : "Chat mode");
    
    // Focus appropriate input
    if (mode === "search") {
      if (this.searchInput) {
        this.searchInput.focus();
      }
    } else {
      this.focusChatInput();
    }
  }

  // Initialize the UI
  initialize(): void {
    this.initializeElements();
    this.setupModeToggleListeners();
  }

  // Get current mode
  getCurrentMode(): "search" | "chat" {
    if (this.searchModeBtn?.classList.contains("active")) {
      return "search";
    }
    return "chat";
  }

  // Set mode programmatically
  setMode(mode: "search" | "chat"): void {
    this.switchMode(mode);
  }
}
