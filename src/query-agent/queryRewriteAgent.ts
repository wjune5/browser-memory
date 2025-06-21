// queryRewriteAgent.ts
// Query rewrite agent: rewrite natural language queries into concise phrases for embedding search

export async function queryRewriteAgent(query: string, apiKey?: string): Promise<string> {
  if (apiKey) {
    // If OpenAI API key is provided, use GPT-3.5/4 to rewrite
    try {
      const openai = new (await import("openai")).default({
        apiKey,
        dangerouslyAllowBrowser: true
      });
      const prompt = `Rewrite the following user query into a concise, search-optimized phrase:\n"${query}"`;
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 30,
        temperature: 0.2
      });
      return response.choices[0]?.message?.content?.trim() || query;
    } catch (error) {
      console.warn("Agent rewrite (OpenAI) failed, fallback to local:", error);
      // If failed, fallback to local keyword extraction
    }
  }
  // Local keyword extraction (simple implementation, can be replaced with more advanced NLP)
  return extractKeywords(query);
}

// Simple keyword extraction: keep words with 4 or more characters
function extractKeywords(text: string): string {
  const words = text.match(/\b\w{4,}\b/g) || [];
  // Remove duplicates and join
  return Array.from(new Set(words)).join(" ");
}
