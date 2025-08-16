"""
Entry point for the Coordinator Agent.
Initializes and starts the agent's server.
"""

import os
import sys
import logging
import argparse
import uvicorn
import asyncio  # Import asyncio
from contextlib import AsyncExitStack  # For MCP exit stack
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

# Load environment variables from .env file
from dotenv import load_dotenv

load_dotenv()


# Add the project root (2 levels up from this file) to Python's module search path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# Use relative imports within the agent package
from .task_manager import TaskManager  # Add this import
from .coordinator import root_agent  # Import the coroutine
from common.app import (
    AgentRequest,
    AgentResponse,
    create_agent_server,
)  # Use the helper

# Configure logging
from utils import setup_logger

logger = setup_logger(__name__)

# Global variable for the TaskManager instance
task_manager_instance: TaskManager | None = None


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Start the Coordinator Agent server")
    parser.add_argument(
        "--host",
        type=str,
        default=os.getenv("Coordinator_HOST", "0.0.0.0"),
        help="Host to bind the server to",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("Coordinator_PORT", "8003")),
        help="Port to bind the server to",
    )
    parser.add_argument(
        "--log-level",
        choices=["debug", "info", "warning", "error", "critical"],
        default=os.getenv("LOG_LEVEL", "info"),
        help="Set the logging level",
    )
    # Arguments related to TaskManager are handled via env vars now
    return parser.parse_args()


async def main():  # Make main async
    """Initialize and start the Coordinator Agent server."""
    global task_manager_instance

    logger.info("Starting Coordinator Agent  Server initialization...")

    # Await the root_agent coroutine to get the actual agent and exit_stack
    logger.info("Awaiting root_agent creation...")
    agent_instance = root_agent
    exit_stack = AsyncExitStack()
    logger.info(f"Agent instance created: {agent_instance.name}")

    # Use the exit_stack to manage the MCP connection lifecycle
    async with exit_stack:
        logger.info("MCP exit_stack entered.")
        # Initialize the TaskManager with the resolved agent instance
        task_manager_instance = TaskManager(agent=agent_instance)
        logger.info("TaskManager initialized with agent instance.")

        # Configuration for the  server
        # Use environment variables or defaults
        host = os.getenv("RECOMMENDER_HOST", "127.0.0.1")
        port = int(os.getenv("RECOMMENDER_PORT", 8003))

        # Create the FastAPI app using the helper
        # Pass the agent name, description, and the task manager instance
        app = create_agent_server(
            name=agent_instance.name,
            description=agent_instance.description,
            task_manager=task_manager_instance,
        )

        logger.info(f"Coordinator Agent server starting on {host}:{port}")

        # Configure uvicorn
        config = uvicorn.Config(app, host=host, port=port, log_level="info")
        server = uvicorn.Server(config)

        # Run the server
        await server.serve()

        # This part will be reached after the server is stopped (e.g., Ctrl+C)
        logger.info("Coordinator Agent server stopped.")


if __name__ == "__main__":
    try:
        # Run the async main function
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Coordinator Agent server stopped by user.")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error during server startup: {str(e)}", exc_info=True)
        sys.exit(1)
