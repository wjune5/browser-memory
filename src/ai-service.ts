// AI Service for handling multiple AI providers
import OpenAI from "openai";
import { DEFAULT_MODELS } from "./consts";
import type { ExtensionSettings } from "./types/memory";

export class AIService {
  private settings: ExtensionSettings;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
  }

  // Get API key for provider
  // private getApiKey(providerName: string): string | undefined {
  //   switch (providerName) {
  //     case "openai":
  //       return this.settings.openaiApiKey;
  //     case "gemini":
  //       return this.settings.apiKey;
  //     case "anthropic":
  //       return this.settings.anthropicApiKey;
  //     case "cohere":
  //       return this.settings.cohereApiKey;
  //     default:
  //       return undefined;
  //   }
  // }

  // Generate embeddings using specified provider
  async generateEmbeddings(text: string): Promise<number[]> {
    const provider = this.settings.aiProvider;
    
    switch (provider) {
      case "openai":
        return this.generateOpenAIEmbeddings(text);
      case "gemini":
        return this.generateGoogleEmbeddings(text);
      case "anthropic":
        return this.generateAnthropicEmbeddings(text);
      case "cohere":
        return this.generateCohereEmbeddings(text);
      case "local":
        return this.generateLocalEmbeddings(text);
      default:
        console.warn(`Unknown provider ${provider}, falling back to local embeddings`);
        return this.generateLocalEmbeddings(text);
    }
  }

  // Generate chat completion using specified provider
  async generateChatCompletion(
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    providerName?: string
  ): Promise<string> {
    const provider = this.settings.aiProvider;
    
    switch (provider) {
      case "openai":
        return this.generateOpenAIChat(messages);
      case "gemini":
        return this.generateGoogleChat(messages);
      case "anthropic":
        return this.generateAnthropicChat(messages);
      case "cohere":
        return this.generateCohereChat(messages);
      default:
        throw new Error(`Unsupported chat provider: ${provider}`);
    }
  }

  // Rewrite query using specified provider
  async rewriteQuery(query: string): Promise<string> {
    const provider = this.settings.aiProvider;
    
    switch (provider) {
      case "openai":
        return this.rewriteQueryWithOpenAI(query);
      case "gemini":
        return this.rewriteQueryWithGoogle(query);
      case "anthropic":
        return this.rewriteQueryWithAnthropic(query);
      case "cohere":
        return this.rewriteQueryWithCohere(query);
      case "local":
        return this.rewriteQueryLocally(query);
      default:
        console.warn(`Unknown provider ${provider}, falling back to local query rewrite`);
        return this.rewriteQueryLocally(query);
    }
  }

  // OpenAI implementations
  private async generateOpenAIEmbeddings(text: string): Promise<number[]> {
    const apiKey = this.settings.apiKey;
    if (!apiKey) throw new Error("OpenAI API key not configured");

    const openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float"
    });

    return response.data[0]?.embedding || [];
  }

  private async generateOpenAIChat(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): Promise<string> {
    const apiKey = this.settings.apiKey;

    if (!apiKey) throw new Error("OpenAI API key not configured");

    const openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages as any,
      max_tokens: 1000,
      temperature: 0.7
    });

    return response.choices[0]?.message?.content || "";
  }

  private async rewriteQueryWithOpenAI(query: string): Promise<string> {
    const messages = [
      { role: "system" as const, content: "Rewrite the following user query into a concise, search-optimized phrase:" },
      { role: "user" as const, content: query }
    ];
    
    const result = await this.generateOpenAIChat(messages);
    return result.trim() || query;
  }

  // Anthropic implementations
  private async generateAnthropicEmbeddings(text: string): Promise<number[]> {
    // Anthropic doesn't have embeddings yet, so we'll use OpenAI embeddings
    // This is a temporary workaround
    return this.generateOpenAIEmbeddings(text);
  }

  private async generateAnthropicChat(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): Promise<string> {
    const apiKey = this.settings.apiKey;

    if (!apiKey) throw new Error("Anthropic API key not configured");

    // Convert messages to Anthropic format
    const systemMessage = messages.find(m => m.role === "system")?.content || "";
    const userMessages = messages.filter(m => m.role === "user").map(m => m.content);
    const assistantMessages = messages.filter(m => m.role === "assistant").map(m => m.content);

    let prompt = systemMessage ? `${systemMessage}\n\n` : "";
    
    for (let i = 0; i < Math.max(userMessages.length, assistantMessages.length); i++) {
      if (userMessages[i]) {
        prompt += `Human: ${userMessages[i]}\n`;
      }
      if (assistantMessages[i]) {
        prompt += `Assistant: ${assistantMessages[i]}\n`;
      }
    }
    prompt += "Assistant:";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0]?.text || "";
  }

  private async rewriteQueryWithAnthropic(query: string): Promise<string> {
    const messages = [
      { role: "system" as const, content: "Rewrite the following user query into a concise, search-optimized phrase:" },
      { role: "user" as const, content: query }
    ];
    
    const result = await this.generateAnthropicChat(messages);
    return result.trim() || query;
  }

  // Google implementations
  private async generateGoogleEmbeddings(text: string): Promise<number[]> {
    const apiKey = this.settings.apiKey;

    if (!apiKey) throw new Error("Google API key not configured");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: text
      })
    });

    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding?.values || [];
  }

  private async generateGoogleChat(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): Promise<string> {
    const apiKey = this.settings.apiKey;

    if (!apiKey) throw new Error("Google API key not configured");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: messages.map(m => ({
          role: m.role === "system" ? "user" : m.role,
          parts: [{ text: m.content }]
        }))
      })
    });

    if (!response.ok) {
      throw new Error(`Google API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates[0]?.content?.parts[0]?.text || "";
  }

  private async rewriteQueryWithGoogle(query: string): Promise<string> {
    const messages = [
      { role: "user" as const, content: `You are a helpful search assistant. Rewrite the following user query into a concise, search-optimized phrase(only return one phrase): "${query}"` }
    ];
    
    const result = await this.generateGoogleChat(messages);
    return result.trim() || query;
  }

  // Cohere implementations
  private async generateCohereEmbeddings(text: string): Promise<number[]> {
    const apiKey = this.settings.apiKey;

    if (!apiKey) throw new Error("Cohere API key not configured");

    const response = await fetch("https://api.cohere.ai/v1/embed", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        texts: [text],
        model: "embed-english-light-v3.0"
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embeddings[0] || [];
  }

  private async generateCohereChat(messages: Array<{ role: "user" | "assistant" | "system"; content: string }>): Promise<string> {
    const apiKey = this.settings.apiKey;

    if (!apiKey) throw new Error("Cohere API key not configured");

    // Convert messages to Cohere format
    const prompt = messages.map(m => `${m.role}: ${m.content}`).join("\n") + "\nAssistant:";

    const response = await fetch("https://api.cohere.ai/v1/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "command",
        prompt: prompt,
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.generations[0]?.text || "";
  }

  private async rewriteQueryWithCohere(query: string): Promise<string> {
    const messages = [
      { role: "user" as const, content: `Rewrite the following user query into a concise, search-optimized phrase: "${query}"` }
    ];
    
    const result = await this.generateCohereChat(messages);
    return result.trim() || query;
  }

  // Local implementations
  private async generateLocalEmbeddings(text: string): Promise<number[]> {
    // Simple local embedding using word frequency
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
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
  }

  private async rewriteQueryLocally(query: string): Promise<string> {
    // Simple keyword extraction: keep words with 4 or more characters
    const words = query.match(/\b\w{4,}\b/g) || [];
    return Array.from(new Set(words)).join(" ");
  }

  // Utility function for local embeddings
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