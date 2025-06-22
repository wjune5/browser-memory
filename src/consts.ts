// Default models for each provider
export const DEFAULT_MODELS: Record<string, { embeddings: string; chat: string; queryRewrite: string }> = {
    openai: {
      embeddings: "text-embedding-3-small",
      chat: "gpt-4o",
      queryRewrite: "gpt-4o"
    },
    gemini: {
      embeddings: "text-embedding-004",
      chat: "gemini-2.0-flash",
      queryRewrite: "gemini-2.0-flash"
    },
    anthropic: {
      embeddings: "text-embedding-3-small",
      chat: "claude-3-sonnet-20240229",
      queryRewrite: "claude-3-haiku-20240307"
    },
    cohere: {
      embeddings: "embed-english-light-v3.0",
      chat: "command",
      queryRewrite: "command-light"
    },
    local: {
      embeddings: "local-tfidf",
      chat: "local-simple",
      queryRewrite: "local-keywords"
    }
  };