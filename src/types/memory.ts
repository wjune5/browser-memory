// Memory-related types for the Browser AI Memory extension

export interface Memory {
  id: number;
  url: string;
  title: string;
  content: string;
  fullContent?: string;
  selectedText?: string | undefined;
  timestamp: string;
  favicon?: string | undefined;
  domain: string;
  tags: string[];
  metadata?: PageMetadata;
  links?: PageLink[];
  images?: PageImage[];
  // New fields for RAG/embeddings
  embedding?: number[];
  chunks?: TextChunk[];
  embeddingModel?: string; // Track which model generated embeddings
}

export interface PageMetadata {
  description?: string;
  keywords?: string;
  author?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  structuredData?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PageLink {
  url: string;
  text: string;
  title: string;
}

export interface PageImage {
  src: string;
  alt: string;
  title: string;
  width?: number;
  height?: number;
}

export interface ExtractedContent {
  title: string;
  url: string;
  domain: string;
  timestamp: string;
  content: string;
  selectedText?: string;
  metadata: PageMetadata;
  links: PageLink[];
  images: PageImage[];
}

export interface ExtensionSettings {
  autoSave: boolean;
  maxMemories: number;
  // AI Provider Configuration
  aiProvider: "openai" | "anthropic" | "gemini" | "cohere" | "local";
  // API Keys for different providers
  // openaiApiKey?: string;
  // anthropicApiKey?: string;
  // googleApiKey?: string;
  // cohereApiKey?: string;
  // Model configurations
  embeddingModel: string;
  chatModel: string;
  queryRewriteModel: string;
  // Legacy support
  apiKey?: string; // For backward compatibility
  maxContentLength?: number;
}

export interface StorageData {
  memories: Memory[];
  settings: ExtensionSettings;
}

export interface SearchResult extends Memory {
  relevanceScore?: number;
  matchedFields?: string[];
}

// New types for RAG functionality
export interface TextChunk {
  id: string;
  content: string;
  embedding?: number[];
  startIndex: number;
  endIndex: number;
  tokens: number; // Approximate token count
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  maxTokens: number;
  chunkOverlap: number;
}

export interface SemanticSearchResult extends Memory {
  similarity: number;
  matchedChunks?: TextChunk[];
}

// Message types for communication between scripts
export interface Message {
  action: string;
  data?: unknown;
}

export interface ExtractContentMessage extends Message {
  action: "extractContent";
  includeSelection?: boolean;
}

export interface SearchMemoriesMessage extends Message {
  action: "searchMemories";
  query: string;
}

export interface SavePageMessage extends Message {
  action: "saveCurrentPage";
}

export interface HighlightTextMessage extends Message {
  action: "highlightText";
  text: string;
}

export interface ScrollToElementMessage extends Message {
  action: "scrollToElement";
  selector: string;
}

// Response types
export interface ExtractContentResponse {
  content: ExtractedContent;
  error?: string;
}

export interface SearchMemoriesResponse {
  results: SearchResult[];
  error?: string;
}

// New message types for embeddings/AI
export interface GenerateEmbeddingMessage extends Message {
  action: "generateEmbedding";
  text: string;
  model?: string;
}

export interface SemanticSearchMessage extends Message {
  action: "semanticSearch";
  query: string;
  limit?: number;
}

export interface GenerateEmbeddingResponse {
  embedding: number[];
  model: string;
  error?: string;
}

export interface SemanticSearchResponse {
  results: SemanticSearchResult[];
  error?: string;
}

// AI Provider Configuration
export interface AIProviderConfig {
  name: string;
  displayName: string;
  supportedFeatures: ("embeddings" | "chat" | "queryRewrite")[];
  defaultModels: {
    embeddings: string;
    chat: string;
    queryRewrite: string;
  };
  apiKeyField: string;
  baseUrl?: string;
}
