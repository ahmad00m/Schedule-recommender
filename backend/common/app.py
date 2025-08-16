# app.py
import sys
import os

# Add the root directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI, Request, Body
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
import uuid

from google.adk.sessions import InMemorySessionService
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.runners import Runner
from google.genai import types as adk_types

from agents.coordinator import coordinator  # your agent instance

# Middleware for CORS support
from fastapi.middleware.cors import CORSMiddleware


# === Request/Response Schemas ===
class AgentRequest(BaseModel):
    message: str = Field(..., description="Message to send to the agent")
    session_id: Optional[str] = Field(
        None, description="Session ID for the agent interaction."
    )
    context: Dict[str, Any] = Field(
        default_factory=dict, description="Additional context for the request"
    )


class AgentResponse(BaseModel):
    session_id: Optional[str] = Field(
        None, description="Session ID for the agent interaction."
    )
    status: str = Field("success", description="Status of the agent response")
    message: str = Field(..., description="Response message from the agent")
    state: Dict[str, Any] = Field(
        default_factory=dict, description="Session state from the agent"
    )


# === Helper Function to Create Agent Server ===
def create_agent_server(name: str, description: str, task_manager: any) -> FastAPI:
    """
    Create a FastAPI server for the agent with the given name and description.
    This function is used to set up the agent server with the provided task manager.
    """
    app = FastAPI(title=f"{name} agent server", description=description)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Post endpoint to handle agent requests
    @app.post("/run", response_model=AgentResponse)
    async def run(request: AgentRequest = Body(...)):
        try:
            result = await task_manager.process_task(
                request.message, request.context, request.session_id
            )
            return AgentResponse(
                message=result.get("message", "Task Completed"),
                session_id=result.get("session_id"),
                status=result.get("status"),
                state=result.get("state"),
            )
        except Exception as e:
            return AgentResponse(
                message=f"Error processing task: {str(e)}",
                status="error",
                state={},
                raw_events=[{"error_type": type(e).__name__}],
                session_id=request.session_id,
            )

    return app
