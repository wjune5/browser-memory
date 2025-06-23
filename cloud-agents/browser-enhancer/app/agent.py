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
    """Get conversational context about the user's browsing to help you chat naturally with them."""
    inputs = {
        "query": query, 
        "memories": memories,
        "user_context": user_context
    }
    
    try:
        # Get the crew result
        crew_result = BrowserMemoryCrew().crew().kickoff(inputs=inputs)
        
        # Debug: Print the structure we got
        print(f"DEBUG: CrewOutput type: {type(crew_result)}")
        print(f"DEBUG: CrewOutput attributes: {[attr for attr in dir(crew_result) if not attr.startswith('_')]}")
        
        # The crew_result.raw should contain the final task's output (enhance_response_task)
        if hasattr(crew_result, 'raw') and crew_result.raw:
            final_response = crew_result.raw.strip()
            print(f"DEBUG: Found raw output: {repr(final_response[:200])}...")
            return final_response
        
        # Fallback: Try to get the final task output directly
        if hasattr(crew_result, 'tasks_output') and crew_result.tasks_output:
            final_task_output = crew_result.tasks_output[-1]  # Last task should be enhance_response_task
            if hasattr(final_task_output, 'raw') and final_task_output.raw:
                final_response = final_task_output.raw.strip()
                print(f"DEBUG: Found final task output: {repr(final_response[:200])}...")
                return final_response
        
        # Another fallback: Try string conversion
        final_response = str(crew_result).strip()
        print(f"DEBUG: Using string conversion: {repr(final_response[:200])}...")
        return final_response
        
    except Exception as e:
        print(f"DEBUG: Error in crew execution: {e}")
        # Fallback response
        return f"Hey! I see you've been browsing some interesting stuff. What's up?"


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
        "You are a friendly AI assistant with access to the user's browsing memory.\n"
        "When the user sends you a message, respond naturally and conversationally, like a friend would.\n"
        "You can reference things they've been browsing when relevant, but keep it casual and natural.\n\n"
        "For casual greetings like 'wassup', 'hey', 'hi' - just respond like a normal person would.\n"
        "Example: If they say 'wassup', you might say 'Hey! Not much, just been checking out your browsing history. I see you've been working on some cool AI stuff. What's up?'\n\n"
        "Use the memory enhancement tool to get context about their browsing, then respond conversationally.\n"
        "Don't explain what you're doing - just chat naturally."
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
