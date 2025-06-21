// Embeddings service for RAG functionality
import OpenAI from "openai";
import type {
  EmbeddingConfig,
  Memory,
  SemanticSearchResult,
  TextChunk
} from "./types/memory";

export class EmbeddingsService {
  private config: EmbeddingConfig;
  private openai: OpenAI | null = null;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  // Initialize OpenAI client with API key
  private async initOpenAI(): Promise<OpenAI> {
    if (this.openai) return this.openai;

    const settings = await chrome.storage.local.get(["settings"]);
    const apiKey = settings.settings?.apiKey;

    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true // Required for browser usage
    });

    return this.openai;
  }

  // Split text into chunks for embedding
  chunkText(text: string, maxTokens: number = 500): TextChunk[] {
    const words = text.split(/\s+/);
    const chunks: TextChunk[] = [];
    let currentChunk = "";
    let currentIndex = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const potentialChunk = currentChunk + (currentChunk ? " " : "") + word;

      // Rough token estimation (1 token ≈ 0.75 words)
      const estimatedTokens = Math.ceil(
        potentialChunk.split(/\s+/).length * 0.75
      );

      if (estimatedTokens > maxTokens && currentChunk) {
        // Save current chunk
        chunks.push({
          id: `chunk_${chunks.length}`,
          content: currentChunk.trim(),
          startIndex: currentIndex,
          endIndex: currentIndex + currentChunk.length,
          tokens: estimatedTokens
        });

        // Start new chunk with overlap
        const overlapWords = Math.floor(this.config.chunkOverlap * 0.75);
        const overlap = currentChunk
          .split(/\s+/)
          .slice(-overlapWords)
          .join(" ");
        currentChunk = overlap + (overlap ? " " : "") + word;
        currentIndex += currentChunk.length - overlap.length;
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: `chunk_${chunks.length}`,
        content: currentChunk.trim(),
        startIndex: currentIndex,
        endIndex: currentIndex + currentChunk.length,
        tokens: Math.ceil(currentChunk.split(/\s+/).length * 0.75)
      });
    }

    return chunks;
  }

  // Generate embeddings for text
  async generateEmbedding(text: string): Promise<number[]> {
    console.log("🤖 Generating embedding using model:", this.config.model);
    console.log("📝 Text length:", text.length, "characters");

    try {
      switch (this.config.model) {
        case "openai":
          return this.generateOpenAIEmbedding(text);
        case "local":
          return this.generateLocalEmbedding(text);
        case "cohere":
          return this.generateCohereEmbedding(text);
        default:
          throw new Error(`Unsupported embedding model: ${this.config.model}`);
      }
    } catch (error) {
      console.error("❌ Embedding generation failed:", error);
      throw error;
    }
  }

  // OpenAI embeddings using the official SDK
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    try {
      const openai = await this.initOpenAI();

      const response = await openai.embeddings.create({
        model: "text-embedding-3-small", // 1536 dimensions, cost-effective
        input: text,
        encoding_format: "float"
      });

      return response.data[0]?.embedding || [];
    } catch (error) {
      console.error("OpenAI embedding error:", error);
      throw new Error(
        `OpenAI embedding failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Local embeddings (simple TF-IDF approximation)
  private async generateLocalEmbedding(text: string): Promise<number[]> {
    // Simple local embedding using word frequency
    // In production, you'd want a proper local model like Sentence Transformers
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCounts = new Map<string, number>();

    words.forEach((word) => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    // Create a simple 384-dimensional vector
    const dimensions = 384;
    const embedding = new Array(dimensions).fill(0);

    Array.from(wordCounts.entries()).forEach(([word, count], index) => {
      const hash = this.simpleHash(word);
      const position = Math.abs(hash) % dimensions;
      embedding[position] += count / words.length;
    });

    // Normalize the vector
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
  }

  // Cohere embeddings
  private async generateCohereEmbedding(text: string): Promise<number[]> {
    const settings = await chrome.storage.local.get(["settings"]);
    const apiKey = settings.settings?.cohereApiKey;

    if (!apiKey) {
      throw new Error("Cohere API key not configured");
    }

    const response = await fetch("https://api.cohere.ai/v1/embed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        texts: [text],
        model: "embed-english-light-v3.0" // 384 dimensions
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embeddings[0];
  }

  // Calculate cosine similarity between embeddings
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      console.warn("⚠️  Embedding dimension mismatch:", {
        aLength: a.length,
        bLength: b.length
      });
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += (a[i] || 0) * (b[i] || 0);
      normA += (a[i] || 0) * (a[i] || 0);
      normB += (b[i] || 0) * (b[i] || 0);
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    const similarity = magnitude > 0 ? dotProduct / magnitude : 0;

    // Only log high similarities to avoid noise
    if (similarity > 0.05) {
      console.log("🔗 Cosine similarity calculated:", {
        similarity: similarity.toFixed(4),
        dotProduct: dotProduct.toFixed(4),
        magnitudeA: Math.sqrt(normA).toFixed(4),
        magnitudeB: Math.sqrt(normB).toFixed(4)
      });
    }

    return similarity;
  }

  // Search memories by semantic similarity
  async semanticSearch(
    query: string,
    memories: Memory[],
    limit: number = 10
  ): Promise<SemanticSearchResult[]> {
    console.log("🔍 Starting semantic search with query:", query);
    console.log("📊 Processing", memories.length, "memories");

    try {
      const queryEmbedding = await this.generateEmbedding(query);
      console.log(
        "✅ Query embedding generated, dimensions:",
        queryEmbedding.length
      );
      console.log(
        "🔢 Query embedding sample (first 5 values):",
        queryEmbedding.slice(0, 5)
      );
    } catch (error) {
      console.error("❌ Failed to generate query embedding:", error);
      return [];
    }

    const queryEmbedding = await this.generateEmbedding(query);
    const results: SemanticSearchResult[] = [];
    let memoriesWithEmbeddings = 0;
    let memoriesProcessed = 0;

    for (const memory of memories) {
      memoriesProcessed++;

      if (!memory.embedding) {
        console.log(
          `⚠️  Memory ${memoriesProcessed} has no embedding, skipping:`,
          {
            url: memory.url,
            title: memory.title?.substring(0, 50) + "..."
          }
        );
        continue;
      }

      memoriesWithEmbeddings++;
      console.log(
        `🧮 Processing memory ${memoriesProcessed} with embedding dimensions:`,
        memory.embedding.length
      );

      const similarity = this.cosineSimilarity(
        queryEmbedding,
        memory.embedding!
      );

      console.log(`📈 Similarity score for memory ${memoriesProcessed}:`, {
        similarity: similarity.toFixed(4),
        title: memory.title?.substring(0, 50) + "...",
        url: memory.url,
        passesThreshold: similarity > 0.1
      });

      if (similarity > 0.1) {
        // Similarity threshold
        const matchedChunks =
          memory.chunks?.filter((chunk) => {
            if (!chunk.embedding) return false;
            const chunkSimilarity = this.cosineSimilarity(
              queryEmbedding,
              chunk.embedding!
            );
            console.log(
              `  🧩 Chunk similarity: ${chunkSimilarity.toFixed(4)} (passes: ${
                chunkSimilarity > 0.15
              })`
            );
            return chunkSimilarity > 0.15;
          }) || [];

        console.log(
          `✅ Adding memory to results with ${matchedChunks.length} matched chunks`
        );

        results.push({
          ...memory,
          similarity,
          matchedChunks
        });
      }
    }

    console.log("📋 Search summary:", {
      totalMemories: memories.length,
      memoriesWithEmbeddings,
      memoriesProcessed,
      resultsFound: results.length,
      threshold: 0.1
    });

    // Sort by similarity and return top results
    const sortedResults = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(
      "🎯 Final results:",
      sortedResults.map((r) => ({
        similarity: r.similarity.toFixed(4),
        title: r.title?.substring(0, 50) + "...",
        url: r.url,
        matchedChunks: r.matchedChunks?.length || 0
      }))
    );

    return sortedResults;
  }

  // Simple hash function for local embeddings
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

// Storage utilities for embeddings
export class EmbeddingsStorage {
  // Store memory with embeddings, handling Chrome storage limits
  static async storeMemoryWithEmbeddings(memory: Memory): Promise<void> {
    const result = await chrome.storage.local.get(["memories"]);
    const memories: Memory[] = result.memories || [];

    // Check storage size before adding
    const serialized = JSON.stringify(memory);
    const sizeKB = new Blob([serialized]).size / 1024;

    if (sizeKB > 150) {
      // If memory is too large, store without embeddings
      console.warn(
        "Memory too large, storing without embeddings:",
        sizeKB,
        "KB"
      );
      const lightMemory = { ...memory };
      delete lightMemory.embedding;
      delete lightMemory.chunks;
      memories.unshift(lightMemory);
    } else {
      memories.unshift(memory);
    }

    // Keep storage under limits
    const maxMemories = 100;
    const trimmedMemories = memories.slice(0, maxMemories);

    await chrome.storage.local.set({ memories: trimmedMemories });
  }

  // Get total storage usage
  static async getStorageInfo(): Promise<{ used: number; total: number }> {
    const data = await chrome.storage.local.get(null);
    const used = new Blob([JSON.stringify(data)]).size;
    const total = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default

    return { used, total };
  }
}
