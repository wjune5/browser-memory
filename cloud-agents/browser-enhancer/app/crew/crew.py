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
    def memory_analyst_agent(self) -> Agent:
        return Agent(
            role="Browser Memory Analyst",
            goal="Analyze browsing patterns and extract meaningful insights from user's memory data",
            backstory="You are an expert at understanding user behavior through their browsing history. You can identify learning patterns, interests, and knowledge progression from web content they've consumed.",
            allow_delegation=False,
            verbose=True,
            llm=self.llm,
        )

    @agent
    def insight_generator_agent(self) -> Agent:
        return Agent(
            role="Insight Generator",
            goal="Generate deep insights and connections between different pieces of browsing memory",
            backstory="You excel at finding hidden connections between different topics and ideas. You can identify knowledge gaps and suggest logical next steps in a user's learning journey.",
            allow_delegation=True,
            verbose=True,
            llm=self.llm,
        )

    @agent
    def response_enhancer_agent(self) -> Agent:
        return Agent(
            role="Response Enhancement Specialist",
            goal="Craft comprehensive, personalized responses that go beyond simple retrieval",
            backstory="You are skilled at taking raw analysis and insights to create helpful, contextual responses that provide real value to users based on their browsing history and current query.",
            allow_delegation=False,
            verbose=True,
            llm=self.llm,
        )

    @task
    def analyze_memory_task(self) -> Task:
        return Task(
            description="Analyze the provided browser memories to understand patterns, topics, and user interests. Input includes: query={query}, memories={memories}, user_context={user_context}",
            expected_output="A detailed analysis of browsing patterns, identified topics, learning progression, and key insights about the user's interests and knowledge level.",
            agent=self.memory_analyst_agent(),
        )

    @task
    def generate_insights_task(self) -> Task:
        return Task(
            description="Based on the memory analysis, generate deep insights about connections between topics, identify knowledge gaps, and suggest related areas of interest.",
            expected_output="Comprehensive insights including: topic connections, knowledge progression patterns, identified gaps, and suggested next steps or related topics.",
            agent=self.insight_generator_agent(),
        )

    @task
    def enhance_response_task(self) -> Task:
        return Task(
            description="Create an enhanced response that combines the original query answer with the analysis and insights to provide maximum value to the user.",
            expected_output="A well-structured, comprehensive response that answers the original query while incorporating personalized insights, connections to previous browsing, and actionable suggestions.",
            agent=self.response_enhancer_agent(),
        )

    @crew
    def crew(self) -> Crew:
        """Creates the Browser Memory Enhancement Crew"""
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
