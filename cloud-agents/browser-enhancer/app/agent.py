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

# mypy: disable-error-code="union-attr"
import os

from langchain_core.messages import BaseMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from .crew.crew import BrowserMemoryCrew

# Use OpenAI for local testing, Vertex AI for production
LLM_MODEL = "gpt-3.5-turbo"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "test-key")


@tool
def enhance_memory_response(query: str, memories: str, user_context: str) -> str:
    """Use this tool to enhance browser memory responses with multi-agent analysis."""
    inputs = {
        "query": query, 
        "memories": memories,
        "user_context": user_context
    }
    return BrowserMemoryCrew().crew().kickoff(inputs=inputs)


tools = [enhance_memory_response]

# 2. Set up the language model (OpenAI for local testing)
llm = ChatOpenAI(
    model=LLM_MODEL, 
    temperature=0, 
    max_tokens=4096,
    openai_api_key=OPENAI_API_KEY
).bind_tools(tools)


# 3. Define workflow components
def should_continue(state: MessagesState) -> str:
    """Determines whether to use the crew or end the conversation."""
    last_message = state["messages"][-1]
    return "memory_crew" if last_message.tool_calls else END


def call_model(state: MessagesState, config: RunnableConfig) -> dict[str, BaseMessage]:
    """Calls the language model and returns the response."""
    system_message = (
        "You are an expert Browser Memory Enhancement Assistant.\n"
        "Your role is to take pre-filtered browser memories and user queries and enhance "
        "the response using multi-agent analysis.\n"
        "You receive queries along with relevant memories that have already been filtered "
        "by the user's local RAG system.\n"
        "Your job is to analyze patterns, find connections, and provide enhanced insights "
        "that go beyond simple retrieval.\n"
        "Use your memory enhancement tool to coordinate multiple agents for deep analysis."
    )

    messages_with_system = [{"type": "system", "content": system_message}] + state[
        "messages"
    ]
    # Forward the RunnableConfig object to ensure the agent is capable of streaming the response.
    response = llm.invoke(messages_with_system, config)
    return {"messages": response}


# 4. Create the workflow graph
workflow = StateGraph(MessagesState)
workflow.add_node("agent", call_model)
workflow.add_node("memory_crew", ToolNode(tools))
workflow.set_entry_point("agent")

# 5. Define graph edges
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("memory_crew", "agent")

# 6. Compile the workflow
agent = workflow.compile()
