// test-query-rewrite.ts
// Test file for queryRewriteAgent

import { queryRewriteAgent } from "./src/query-agent/queryRewriteAgent";

async function testQueryRewrite() {
  console.log("🧪 Testing queryRewriteAgent...\n");

  // Test cases
  const testQueries = [
    "How do I make a cake?",
    "What is the weather like today?",
    "slippery",
    "JavaScript async await tutorial",
    "How to install Node.js on Windows",
    "React hooks useState useEffect",
    "Python pandas dataframe operations"
  ];

  console.log("📝 Testing with local keyword extraction (no API key):\n");
  
  for (const query of testQueries) {
    try {
      const result = await queryRewriteAgent(query, );
      console.log(`Input:  "${query}"`);
      console.log(`Output: "${result}"`);
      console.log("---");
    } catch (error) {
      console.error(`❌ Error testing query "${query}":`, error);
    }
  }

  console.log("\n🔑 Testing with OpenAI API (if API key provided):\n");
  
  // You can replace this with your actual API key for testing
  const apiKey = process.env.OPENAI_API_KEY || "test-key";
  
  if (apiKey && apiKey !== "test-key") {
    for (const query of testQueries.slice(0, 3)) { // Test first 3 queries with API
      try {
        const result = await queryRewriteAgent(query, apiKey);
        console.log(`Input:  "${query}"`);
        console.log(`Output: "${result}"`);
        console.log("---");
      } catch (error) {
        console.error(`❌ Error testing query "${query}" with API:`, error);
      }
    }
  } else {
    console.log("⚠️  No valid OpenAI API key found. Set OPENAI_API_KEY environment variable to test with API.");
    console.log("   Testing with invalid key to show fallback behavior:");
    
    try {
      const result = await queryRewriteAgent("test query", "invalid-key");
      console.log(`Input:  "test query"`);
      console.log(`Output: "${result}" (fallback to local extraction)`);
    } catch (error) {
      console.error("❌ Error with invalid API key:", error);
    }
  }
}

// Run the test
testQueryRewrite().catch(console.error); 