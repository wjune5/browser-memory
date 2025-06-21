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
  aiProvider: "local" | "openai" | "claude";
  apiKey?: string;
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
