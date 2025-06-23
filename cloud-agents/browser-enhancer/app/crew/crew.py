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

# mypy: disable-error-code="attr-defined"
import os
from typing import Any

from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task


@CrewBase
class BrowserMemoryCrew:
    """Browser Memory Enhancement Crew"""

    agents_config: dict[str, Any]
    tasks_config: dict[str, Any]

    # Use OpenAI for local testing, will switch to Vertex AI for production
    llm = "gpt-3.5-turbo"

    @agent
    def conversational_agent(self) -> Agent:
        return Agent(
            role="Friendly Chat Assistant",
            goal="Respond to the user naturally and conversationally, like a friend who knows what they've been browsing",
            backstory="You're a casual, friendly AI who has access to the user's browsing history. You chat naturally like a good friend would - not formal or analytical. When they say 'wassup' or 'hey', you respond like a normal person. You can mention their browsing when it's relevant, but keep it conversational and fun.",
            allow_delegation=False,
            verbose=False,
            llm=self.llm,
        )

    @task
    def chat_response_task(self) -> Task:
        return Task(
            description="""
            The user said: "{query}"
            
            Here's what they've been browsing: {memories}
            
            Previous context: {user_context}
            
            Respond to them like a friend would. If they're just saying 'wassup', 'hey', or 'hi', respond casually. 
            You can mention their browsing if it's relevant, but keep it natural and conversational.
            
            Examples:
            - If they say "wassup": "Hey! Not much, just been checking out your browsing. I see you've been diving into some AI stuff - pretty cool! What's up?"
            - If they ask about something specific: Give them a helpful but casual response
            - Keep it friendly and natural, not formal or analytical
            """,
            expected_output="A casual, friendly chat response that feels like talking to a knowledgeable friend. No formal analysis or structured responses - just natural conversation.",
            agent=self.conversational_agent(),
        )

    @crew
    def crew(self) -> Crew:
        """Creates the Browser Memory Enhancement Crew"""
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=False,
        )
