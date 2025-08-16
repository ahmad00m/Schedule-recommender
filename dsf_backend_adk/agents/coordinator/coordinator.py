import os
import sys
import base64

# Add the project root (2 levels up from this file) to Python's module search path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# Import Utility functions
from utils import setup_logger
from utils import load_instructions_file

# Import necessary modules from Google ADK
from google.adk import Agent
from google.adk.agents.callback_context import CallbackContext
from typing import Optional
from google.genai import types

# Import different agents
from agents.talkative import root_agent as talkative
from agents.scheduler import root_agent as scheduler

# Setup logger for this module
logger = setup_logger(__name__)
client = database.Client()

# === Agent Configuration ===
MODEL = "gemini-2.0-flash"
NAME = "manager"
INSTRUCTIONS = load_instructions_file(filename="agents/coordinator/instructions.txt")
DESCRIPTION = load_instructions_file(filename="agents/coordinator/description.txt")

# === Logging Configuration ===
logger.info(f"Entered {NAME} agent.")
logger.info(
    f"Using Description: {DESCRIPTION[:50]}..."
)  # Log first 50 characters for brevity
logger.info(
    f"Using Instructions: {INSTRUCTIONS[:50]}..."
)  # Log first 50 characters for brevity

# === Agent Callbacks ===
from google.adk.agents.callback_context import CallbackContext
from typing import Optional
from google.genai import types

# Make sure this is defined elsewhere in your file
client = database.Client()

# Student ID
STUDENT_ID = "FenevvS0J5R+TKOxsGvMx1APaq3HODg+ArWygHyRpYs="


def term_label(term_code: str) -> str:
    """
    Converts a 6-digit term code (e.g., 202540) into a human-readable format (e.g., Fall 2025)
    """
    term_map = {"10": "Winter", "20": "Spring", "30": "Summer", "40": "Fall"}
    if len(term_code) == 6:
        year = term_code[:4]
        code = term_code[4:]
        return f"{term_map.get(code, 'Unknown')} {year}"
    return "Unknown Term"


def before_agent_callback(callback_context: CallbackContext) -> Optional[types.Content]:
    """
    Callback that runs before the agent starts processing a request.

    Loads the student record from database using the Base64-encoded student ID
    and sets it into context state as 'student_details'.
    """
    state = callback_context.state

    try:
        query = """
            SELECT *
            FROM `your_project.your_dataset.your_table`
            WHERE Student_ID = @student_id
            LIMIT 1
        """
        job_config = database.QueryJobConfig(
            query_parameters=[
                database.ScalarQueryParameter("student_id", "STRING", STUDENT_ID)
            ]
        )

        logger.info(
            f"[BEFORE CALLBACK] Running database to fetch student_major for ID: {STUDENT_ID}"
        )
        results = list(client.query(query, job_config=job_config).result())

        if results:
            raw = dict(results[0])

            # Extract and convert Student_ID from bytes to Base64 string
            raw_student_id = raw.get("Student_ID")

            # Build student dict with Student_ID first, then other non-null
            student = {"Student_ID": raw_student_id}

            student.update(
                {
                    k: v
                    for k, v in raw.items()
                    if k != "Student_ID" and v is not None and not isinstance(v, bytes)
                }
            )

            # Add derived term fields
            term_code = raw.get("Term")
            if term_code:
                student["Term_Code"] = term_code
                student["Term"] = term_label(term_code)

            # Set in state
            state["student_details"] = student
            logger.info(
                f"[BEFORE CALLBACK] Loaded student: {student.get('Major_1_Desc', 'Unknown Major')} ({raw_student_id})"
            )
        else:
            logger.warning(
                f"[BEFORE CALLBACK] Student ID {STUDENT_ID} not found in database."
            )
            state["student_details"] = {}

    except Exception as e:
        logger.error(f"[BEFORE CALLBACK] database query failed: {e}")
        state["student_details"] = {}

    logger.info(
        "[BEFORE CALLBACK] Initialized state with student details from database."
    )
    return None


# Create the root coordinator agent with the talkative and scheduler sub-agent
coordinator = Agent(
    name=NAME,
    model=MODEL,
    description=DESCRIPTION,
    instruction=INSTRUCTIONS,
    sub_agents=[talkative, scheduler],
    before_agent_callback=before_agent_callback,
)

root_agent = coordinator

# Log the successful initialization of the agent
logger.info(f"Initialized {NAME} agent.")
