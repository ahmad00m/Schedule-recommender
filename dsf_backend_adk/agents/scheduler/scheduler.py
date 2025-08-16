import os
import sys
from decimal import Decimal

# Add the project root (2 levels up from this file) to Python's module search path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# Import necessary modules from the project
from google.adk.agents import Agent
from google.adk.tools import ToolContext

from utils import load_instructions_file, setup_logger

# === Logging Setup ===
client = database.Client.from_service_account_json("database_key.json")
logger = setup_logger(__name__)


# === Tools ===
def get_enrollable_courses(tool_context: ToolContext) -> dict:
    """
    Retrieves the list of courses that a student still needs and that are offered in the upcoming term.

    This function performs two database operations:
    1. It fetches the list of courses the student has yet to complete.
    2. It fetches the list of courses being offered in the next academic term.
    It then computes the intersection to determine which needed courses are available for enrollment.

    Returns:
        dict: A dictionary containing:
            - 'status' (str): 'success' or 'error'.
            - 'message' (str): A descriptive message.
            - 'courses' (list): A sorted list of eligible course IDs the student can enroll in.

    Example:
        {
            "status": "success",
            "message": "4 courses are available for enrollment next term.",
            "courses": ["CS101", "MATH205", "ENG150", "BIO220"]
        }
    """
    try:
        # === Get student ID ===
        student_details = tool_context.state.get("student_details", {})
        student_id = student_details.get("Student_ID")

        logger.info(f"Fetching enrollable courses for student ID: {student_id}")

        if not student_id:
            return {
                "status": "error",
                "message": "Student ID not found in context state.",
                "courses": [],
            }

        # === Query all rows for student ===
        query_needed = """
            SELECT courses_still_needed
            FROM student_details
            WHERE Student_ID = @student_id
        """
        job_config_needed = database.QueryJobConfig(
            query_parameters=[
                database.ScalarQueryParameter("student_id", "STRING", student_id)
            ]
        )

        result_needed = list(
            client.query(query_needed, job_config=job_config_needed).result()
        )

        # === Aggregate all needed courses ===
        courses_still_needed = set()
        for row in result_needed:
            cell = str(row.get("courses_still_needed", "")).strip()
            if cell and cell.lower() != "nan":
                courses_still_needed.update(c.strip() for c in cell.split(",") if c.strip())

        if not courses_still_needed:
            return {
                "status": "error",
                "message": "No 'courses_still_needed' courses found for the student.",
                "courses": [],
            }

        # === Get list of offered courses ===
        query_offerings = """
            SELECT COURSE_ID
            FROM course_offerings_table
        """
        result_offerings = list(client.query(query_offerings).result())
        offered_courses = set(
            row["COURSE_ID"] for row in result_offerings if row["COURSE_ID"]
        )

        # === Intersect ===
        eligible_courses = sorted(list(courses_still_needed & offered_courses))

        return {
            "status": "success",
            "message": f"{len(eligible_courses)} courses are available for enrollment next term.",
            "courses": eligible_courses,
        }

    except Exception as e:
        logger.error(f"Error fetching enrollable courses: {e}")
        return {
            "status": "error",
            "message": f"Failed to load enrollable courses: {e}",
            "courses": [],
        }


def get_course_details(course_id: str) -> dict:
    """
    Retrieve detailed offering information for a specific course by its course ID.

    This function queries database's table to find all sections
    of a given course (e.g., "ENGR001M") offered in the upcoming term.

    Parameters:
        course_id (str): The course ID to look up.

    Returns:
        dict: {
            "status": "success" | "error",
            "course_details": [list of offering dicts],
            "message": optional message
        }
    """

    def convert_decimal(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return obj

    try:
        query = """
            SELECT *
            FROM course_offerings_table o
            LEFT JOIN course_meetings_table m
            ON o.COURSE_REFERENCE_NUMBER = m.COURSE_REFERENCE_NUMBER
            WHERE o.COURSE_ID = @course_id
        """

        job_config = database.QueryJobConfig(
            query_parameters=[
                database.ScalarQueryParameter("course_id", "STRING", course_id)
            ]
        )
        results = list(client.query(query, job_config=job_config).result())

        if not results:
            return {
                "status": "error",
                "course_details": [],
                "message": f"No offerings found for course '{course_id}'.",
            }

        offerings = [
            {k: convert_decimal(v) for k, v in dict(row).items()} for row in results
        ]

        return {"status": "success", "course_details": offerings}

    except Exception as e:
        logger.error(f"Failed to fetch course details for {course_id}: {e}")
        return {
            "status": "error",
            "course_details": [],
            "message": f"Failed to fetch course details: {e}",
        }


def select_desired_courses(
    selected_course_ids: list[str], tool_context: ToolContext
) -> dict:
    """
    Retrieves selected course offerings and stores only the essential fields in the state.

    Args:
        selected_course_ids (list[str]): List of course IDs (e.g., ["CS201", "CS218"]).
        tool_context (ToolContext): Tool context object maintaining agent state.

    Returns:
        dict: Success or error response.
    """
    desired_fields = {
        "COURSE_REFERENCE_NUMBER",
        "COURSE_ID",
        "SCHEDULE_TYPE",
        "COURSE_TIME",
        "MEETING_DAYS",
    }

    selected_courses = {}

    for course_id in selected_course_ids:
        response = get_course_details(course_id)
        if response["status"] != "success" or not response["course_details"]:
            return {
                "status": "error",
                "message": f"Could not retrieve details for course '{course_id}'",
            }

        filtered_details = []
        for record in response["course_details"]:
            filtered_record = {k: v for k, v in record.items() if k in desired_fields}
            filtered_details.append(filtered_record)

        selected_courses[course_id] = filtered_details

    tool_context.state["selected_courses"] = selected_courses

    return {
        "status": "success",
        "message": f"✅ Added {len(selected_courses)} selected courses to state.",
    }

def finalize_schedule(tool_context: ToolContext) -> dict:
    """
    Builds a student schedule by selecting one lecture section and one discussion/lab section 
    (if available) for each course based on the provided constraints.

    This function intelligently selects sections by:
    1. Finding lecture sections (SCHEDULE_TYPE like 'LEC', 'Lecture', etc.)
    2. Finding discussion/lab sections (SCHEDULE_TYPE like 'DIS', 'LAB', 'Discussion', 'Laboratory', etc.)
    3. Selecting one of each type per course
    4. Building a comprehensive schedule structure

    Returns:
        dict: A structured schedule with both lecture and discussion/lab sections, or error response.
    """
    try:
        logger.info("Starting finalize_schedule function")
        
        selected_courses = tool_context.state.get("selected_courses", {})
        if not selected_courses:
            logger.warning("No selected courses found in state")
            return {
                "status": "error",
                "message": "No courses found in state. Please select courses first.",
            }
        
        logger.info(f"Found {len(selected_courses)} courses in state")

        
        day_map = {
            "M": "Monday",
            "T": "Tuesday", 
            "W": "Wednesday",
            "R": "Thursday",
            "F": "Friday",
            "S": "Saturday",
            "U": "Sunday",
        }

        final_schedule = {}
        
        # Get constraints from state if they exist
        constraints = tool_context.state.get("constraints", {})
        avoided_days = constraints.get("avoided_days", [])
        avoided_time_ranges = constraints.get("avoided_time_ranges", [])
        logger.info(f"Using constraints - avoided days: {avoided_days}, avoided time ranges: {avoided_time_ranges}")

        def is_lecture_section(schedule_type):
            """Check if a section is a lecture section."""
            if not schedule_type:
                return False
            schedule_type = str(schedule_type).upper().strip()
            lecture_types = ['LEC', 'LECTURE', 'L']
            return any(lec_type in schedule_type for lec_type in lecture_types)

        def is_discussion_or_lab_section(schedule_type):
            """Check if a section is a discussion or lab section."""
            if not schedule_type:
                return False
            schedule_type = str(schedule_type).upper().strip()
            discussion_lab_types = ['DIS', 'DISCUSSION', 'LAB', 'LABORATORY', 'D', 'REC', 'RECITATION']
            return any(dl_type in schedule_type for dl_type in discussion_lab_types)

        def format_section_schedule(section):
            """Format a section's schedule information."""
            try:
                course_days = {day: [] for day in day_map.values()}
                
                days_field = section.get("MEETING_DAYS")
                start = section.get("COURSE_START_TIME")
                end = section.get("COURSE_END_TIME")

                for abbrev in str(days_field).split(","):
                    abbrev = abbrev.strip().upper()
                    if abbrev in day_map:
                        day_name = day_map[abbrev]
                        try:
                            # Convert to int for UI parsing
                            start_int = int(float(str(start)))
                            end_int = int(float(str(end)))
                            course_days[day_name] = [start_int, end_int]
                        except (ValueError, TypeError) as e:
                            logger.warning(f"Time conversion error for {abbrev}: {e}")

                return course_days
            except Exception as e:
                logger.error(f"Error in format_section_schedule: {e}")
                return {day: [] for day in day_map.values()}

        # Process each course
        for course_id, sections in selected_courses.items():
            try:
                logger.info(f"Processing course {course_id} with {len(sections)} sections")
                
                if not sections:
                    logger.warning(f"No sections found for course {course_id}")
                    continue

                # Separate sections by type
                lecture_sections = []
                discussion_lab_sections = []
                other_sections = []

                for section in sections:
                    schedule_type = section.get("SCHEDULE_TYPE", "")
                    logger.debug(f"Section schedule type: {schedule_type}")
                    
                    if is_lecture_section(schedule_type):
                        lecture_sections.append(section)
                    elif is_discussion_or_lab_section(schedule_type):
                        discussion_lab_sections.append(section)
                    else:
                        other_sections.append(section)

                logger.info(f"Course {course_id}: {len(lecture_sections)} lectures, {len(discussion_lab_sections)} discussion/labs, {len(other_sections)} other")

                # Select best sections
                selected_lecture = None
                selected_discussion_lab = None

                # Select lecture section (prefer first available)
                if lecture_sections:
                    selected_lecture = lecture_sections[0]
                elif other_sections:
                    # Fallback to first section if no clear lecture
                    selected_lecture = other_sections[0]

                # Select discussion/lab section
                if discussion_lab_sections:
                    selected_discussion_lab = discussion_lab_sections[0]

                # Build the schedule entry for this course
                course_schedule_entry = {
                    "course_id": course_id,
                    "sections": []
                }

                # Add lecture section
                if selected_lecture:
                    lecture_entry = {
                        "type": "lecture",
                        "crn": selected_lecture.get("COURSE_REFERENCE_NUMBER"),
                        "schedule_type": selected_lecture.get("SCHEDULE_TYPE"),
                        "days": format_section_schedule(selected_lecture)
                    }
                    course_schedule_entry["sections"].append(lecture_entry)
                    logger.debug(f"Added lecture section for {course_id}")

                # Add discussion/lab section
                if selected_discussion_lab:
                    disc_lab_entry = {
                        "type": "discussion_lab",
                        "crn": selected_discussion_lab.get("COURSE_REFERENCE_NUMBER"),
                        "schedule_type": selected_discussion_lab.get("SCHEDULE_TYPE"),
                        "days": format_section_schedule(selected_discussion_lab)
                    }
                    course_schedule_entry["sections"].append(disc_lab_entry)
                    logger.debug(f"Added discussion/lab section for {course_id}")

                final_schedule[course_id] = course_schedule_entry
                
            except Exception as e:
                logger.error(f"Error processing course {course_id}: {e}")
                # Continue with other courses even if one fails
                continue

        # Store the schedule in state
        tool_context.state["final_schedule"] = final_schedule
        logger.info(f"Stored final schedule with {len(final_schedule)} courses")

        # CREATE BACKWARD-COMPATIBLE FORMAT FOR UI
        legacy_schedule = {}
        for course_id, course_data in final_schedule.items():
            sections = course_data.get("sections", [])
            
            # Combine all sections into a single entry for UI compatibility
            combined_days = {}
            combined_crns = []
            combined_types = []
            
            for section in sections:
                section_days = section.get("days", {})
                section_crn = section.get("crn")
                section_type = section.get("schedule_type", "")
                
                # Merge days from all sections
                for day, times in section_days.items():
                    if times: 
                        if day not in combined_days:
                            combined_days[day] = times
                
                if section_crn:
                    combined_crns.append(str(section_crn))
                if section_type:
                    combined_types.append(section_type)
            
            # Create legacy format entry
            legacy_schedule[course_id] = {
                "Name": course_id,
                "CRN": "/".join(combined_crns) if combined_crns else "",
                "Schedule_Type": "/".join(combined_types) if combined_types else "",
                "Days": combined_days
            }

        import json
        try:
            json_test = json.dumps(legacy_schedule, default=str)
            logger.info(f"JSON serialization test passed for legacy_schedule")
        except Exception as e:
            logger.error(f"JSON serialization failed: {e}")

        # Create a summary for the response
        total_sections = sum(len(course.get("sections", [])) for course in final_schedule.values())
        
        return {
            "status": "success",
            "message": f"📅 Final schedule constructed with {len(final_schedule)} courses and {total_sections} sections.",
            "schedule": legacy_schedule, 
            "detailed_schedule": final_schedule,
            "summary": {
                "total_courses": len(final_schedule),
                "total_sections": total_sections,
                "courses_with_lecture": sum(1 for course in final_schedule.values() 
                                          if any(section.get("type") == "lecture" for section in course.get("sections", []))),
                "courses_with_discussion_lab": sum(1 for course in final_schedule.values() 
                                                 if any(section.get("type") == "discussion_lab" for section in course.get("sections", [])))
            }
        }
        
    except Exception as e:
        logger.error(f"Critical error in finalize_schedule: {e}")
        return {
            "status": "error",
            "message": f"Failed to build schedule: {str(e)}",
            "schedule": {}
        }

def get_student_details(tool_context: ToolContext) -> dict:
    """
    Retrieve the student's details from the tool context state.

    This function accesses the `state["student_details"]` dictionary to return the student's information.
    It is designed to be used as a tool function in agent workflows that require access to student data.

    Returns:
        dict: A dictionary containing the student's details, or an error message if not found.
    """
    try:
        student_details = tool_context.state["student_details"]
        return {"status": "success", "student_details": student_details}
    except KeyError:
        return {"status": "error", "message": "Student details not found in state."}


# === Agent Configuration ===
MODEL = "gemini-2.0-flash"
NAME = "scheduler"
DESCRIPTION = load_instructions_file("agents/scheduler/description.txt")
INSTRUCTIONS = load_instructions_file("agents/scheduler/instructions.txt")

# === Logging ===
logger.info(f"Entered {NAME} agent.")
logger.info(f"Using Description: {DESCRIPTION[:50]}...")
logger.info(f"Using Instructions: {INSTRUCTIONS[:50]}...")

# === Instantiate Agent ===
scheduler = Agent(
    name=NAME,
    model=MODEL,
    description=DESCRIPTION,
    instruction=INSTRUCTIONS,
    tools=[
        get_enrollable_courses,
        get_course_details,
        get_student_details,
        select_desired_courses,
        finalize_schedule,
    ],
)

root_agent = scheduler
logger.info(f"Initialized {NAME} agent.")
