import os
import sys
import uuid
from typing import Dict, Any, Optional
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.genai import types as adk_types

# Ensure the root directory is in sys.path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# Setup Logging
from utils import setup_logger

logger = setup_logger(__name__)


APP_NAME = "coordinator_app"


class TaskManager:
    """TaskManager for the Coordinator Agent"""

    def __init__(self, agent: Agent):
        logger.info(f"Initializing TaskManager for {agent.name}")
        self.agent = agent
        self.session_service = InMemorySessionService()
        self.artifact_service = InMemoryArtifactService()

        self.runner = Runner(
            agent=self.agent,
            app_name=APP_NAME,
            session_service=self.session_service,
            artifact_service=self.artifact_service,
        )
        logger.info(f"TaskManager initialized for {agent.name}")

    async def process_task(
        self, message: str, context: Dict[str, Any], session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        user_id = context.get("user_id", "default_user")

        if not session_id:
            session_id = str(uuid.uuid4())
            logger.info(f"Generated new session ID: {session_id}")

        logger.info(f"Processing task for user {user_id} with session ID {session_id}")

        # Create a new session or retrieve existing one
        session = await self.session_service.get_session(
            app_name=APP_NAME, session_id=session_id, user_id=user_id
        )

        if not session:
            logger.error(
                f"❌ Session not found before run_async() for session_id={session_id}"
            )
        else:
            logger.info(f"✅ Session is ready before run_async(): {session}")

        if not session:
            session = await self.session_service.create_session(
                app_name=APP_NAME, session_id=session_id, user_id=user_id, state={}
            )
            logger.info(f"Created new session for user {user_id}")

        # Create user message content
        request_content = adk_types.Content(
            role="user", parts=[adk_types.Part(text=message)]
        )

        try:
            # Run the agent
            events_async = self.runner.run_async(
                user_id=user_id, session_id=session_id, new_message=request_content
            )

            # Process response
            final_message = "(No response generated)"
            raw_events = []

            # Process events
            async for event in events_async:
                raw_events.append(event.model_dump(exclude_none=True))

                logger.debug(f"Received event: {event}")
                logger.debug(f"Event is_final_response: {event.is_final_response()}")
                logger.debug(f"Event content: {event.content}")

                # Apply state_delta directly from event object
                if event.actions and event.actions.state_delta:
                    session.state.update(event.actions.state_delta)

                # If this is a final response, extract the message
                if (
                    event.is_final_response()
                    and event.content
                    and event.content.role == "model"
                ):
                    if event.content.parts and event.content.parts[0].text:
                        final_message = event.content.parts[0].text
                        logger.info(f"Final response: {final_message}")

            # Return formatted response
            return {
                "message": final_message,
                "status": "success",
                "session_id": session_id,
                "state": session.state,
                "raw_events": raw_events,
            }

        except Exception as e:
            logger.error(f"Error running agent: {str(e)}")
            return {
                "message": f"Error processing your request: {str(e)}",
                "status": "error",
                "data": {"error_type": type(e).__name__},
            }
