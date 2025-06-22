// queryRewriteAgent.ts
// Query rewrite agent: rewrite natural language queries into concise phrases for embedding search

import { AIService } from "../ai-service";
import type { ExtensionSettings } from "../types/memory";

export async function queryRewriteAgent(query: string, settings?: ExtensionSettings): Promise<string> {
  if (!settings) {
    // Fallback to local keyword extraction if no settings
    return extractKeywords(query);
  }

  try {
    const aiService = new AIService(settings);
    return await aiService.rewriteQuery(query);
  } catch (error) {
    console.warn("AI query rewrite failed, fallback to local:", error);
    // If failed, fallback to local keyword extraction
    return extractKeywords(query);
  }
}

// Simple keyword extraction: keep words with 4 or more characters
function extractKeywords(text: string): string {
  const words = text.match(/\b\w{4,}\b/g) || [];
  // Remove duplicates and join
  return Array.from(new Set(words)).join(" ");
}
