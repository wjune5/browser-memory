# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import logging
import os
from collections.abc import Generator
from typing import Any, Dict, List

from app.agent import agent
from app.utils.typing import (Feedback, InputChat, Request, dumps,
                              ensure_valid_config)
from fastapi import FastAPI
from fastapi.responses import RedirectResponse, StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel


# Data models for browser memory enhancement
class BrowserMemory(BaseModel):
    title: str
    content: str
    url: str
    similarity: float
    timestamp: str = ""

class BrowserMemoryRequest(BaseModel):
    query: str
    relevantMemories: List[BrowserMemory]
    userContext: List[str] = []

class EnhancementResponse(BaseModel):
    enhancedResponse: str
    agentInsights: Dict[str, Any] = {}
    processingDetails: Dict[str, Any] = {}

# Initialize FastAPI app and logging
app = FastAPI(
    title="browser-enhancer",
    description="API for enhancing browser memory responses with multi-agent analysis",
)

# Use standard Python logging for local testing
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Telemetry (skip for local testing)
try:
    # Skip telemetry for local testing
    logger.info("Skipping telemetry initialization for local testing")
except Exception as e:
    logging.error("Failed to initialize Telemetry: %s", str(e))


def set_tracing_properties(config: RunnableConfig) -> None:
    """Sets tracing association properties for the current request.

    Args:
        config: Optional RunnableConfig containing request metadata
    """
    # Skip tracing for local testing
    logger.info("Skipping tracing for local testing")


def stream_messages(
    input: InputChat,
    config: RunnableConfig | None = None,
) -> Generator[str, None, None]:
    """Stream events in response to an input chat.

    Args:
        input: The input chat messages
        config: Optional configuration for the runnable

    Yields:
        JSON serialized event data
    """
    config = ensure_valid_config(config=config)
    set_tracing_properties(config)
    input_dict = input.model_dump()

    for data in agent.stream(input_dict, config=config, stream_mode="messages"):
        yield dumps(data) + "\n"


# Routes
@app.get("/", response_class=RedirectResponse)
def redirect_root_to_docs() -> RedirectResponse:
    """Redirect the root URL to the API documentation."""
    return RedirectResponse(url="/docs")


@app.post("/enhance", response_model=EnhancementResponse)
async def enhance_browser_memories(request: BrowserMemoryRequest) -> EnhancementResponse:
    """Enhance browser memory responses using multi-agent analysis.
    
    This endpoint receives pre-filtered browser memories and a query,
    then uses multiple AI agents to provide enhanced insights and responses.
    
    Args:
        request: Browser memory request containing query and relevant memories
        
    Returns:
        Enhanced response with insights from multiple agents
    """
    try:
        # Format memories for agent processing
        memories_text = "\n\n".join([
            f"Title: {memory.title}\n"
            f"URL: {memory.url}\n" 
            f"Content: {memory.content}\n"
            f"Relevance: {memory.similarity:.2f}"
            for memory in request.relevantMemories
        ])
        
        user_context_text = "\n".join(request.userContext) if request.userContext else "No previous context"
        
        # Create input message for the agent
        input_chat = InputChat(
            messages=[HumanMessage(
                content=f"Query: {request.query}\n\nRelevant Memories:\n{memories_text}\n\nUser Context:\n{user_context_text}"
            )]
        )
        
        # Process with multi-agent system
        config = ensure_valid_config(None)
        set_tracing_properties(config)
        
        response_content = ""
        for chunk in agent.stream(input_chat.model_dump(), config=config, stream_mode="values"):
            if "messages" in chunk:
                for message in chunk["messages"]:
                    if hasattr(message, 'content') and message.content:
                        response_content += message.content
        
        # Log successful processing
        logger.info({
            "query": request.query,
            "memories_count": len(request.relevantMemories),
            "response_length": len(response_content),
            "status": "success"
        })
        
        return EnhancementResponse(
            enhancedResponse=response_content,
            agentInsights={
                "memoriesAnalyzed": len(request.relevantMemories),
                "topTopics": [memory.title for memory in request.relevantMemories[:3]],
                "averageRelevance": sum(m.similarity for m in request.relevantMemories) / len(request.relevantMemories) if request.relevantMemories else 0
            },
            processingDetails={
                "agentType": "multi_agent_crew",
                "model": "gpt-3.5-turbo", 
                "processedAt": "local_testing"
            }
        )
        
    except Exception as e:
        logger.error({
            "query": request.query,
            "error": str(e),
            "status": "error"
        })
        
        # Return graceful error response
        return EnhancementResponse(
            enhancedResponse=f"I apologize, but I encountered an error while processing your request. Here's what I can tell you based on your query '{request.query}': " + 
                           (f"You have {len(request.relevantMemories)} relevant memories that might help answer this question." if request.relevantMemories else "No relevant memories were found."),
            agentInsights={"error": "Agent processing failed", "fallback": True},
            processingDetails={"error": str(e)}
        )


@app.post("/stream_messages")
def stream_chat_events(request: Request) -> StreamingResponse:
    """Stream chat events in response to an input request.

    Args:
        request: The chat request containing input and config

    Returns:
        Streaming response of chat events
    """
    return StreamingResponse(
        stream_messages(input=request.input, config=request.config),
        media_type="text/event-stream",
    )


@app.post("/feedback")
def collect_feedback(feedback: Feedback) -> dict[str, str]:
    """Collect and log feedback.

    Args:
        feedback: The feedback data to log

    Returns:
        Success message
    """
    logger.info(feedback.model_dump())
    return {"status": "success"}


# Health check endpoint
@app.get("/health")
def health_check():
    """Simple health check endpoint."""
    return {"status": "healthy", "service": "browser-enhancer"}


# Main execution
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
