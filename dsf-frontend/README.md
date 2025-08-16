# Schedule Recommender – Frontend Codebase

Frontend for the **Schedule Recommender** — part of the DS Fellowship Program 2025.

---

## 📘 Overview

This is the frontend for **Schedule Recommender**, an AI-powered course scheduling assistant built for students. It combines a **dynamic calendar view** with an **interactive chatbot** that helps students build, edit, and visualize their class schedules.

The frontend is built with **Next.js**, **TypeScript**, **Tailwind CSS**, and **shadcn/ui**. It integrates with a backend API to retrieve AI-generated schedule suggestions.

---

## 🚀 Core Features

- **📅 Calendar View**  
  Provides a one-week calendar view for students to visualize the schedule created by the system.

- **🤖 Chatbot Interface**  
  Interactive AI-powered chatbot that understands natural language requests and refines schedules based on user preferences.

- **🎨 Modern UI**  
  Built with Tailwind CSS, shadcn/ui, and lucide-react icons for a clean and accessible interface.

---

## 🧱 Project Structure

```
src/
├── app/                # Next.js app routes and layouts
├── components/         # Reusable UI components (Calendar, Chat, etc.)
├── providers/          # React context providers (e.g., schedule state)
├── lib/                # Utility functions (time formatting, parsing)
├── styles/             # Global styles
├── hooks/              # Custom React hooks
docs/
└── blueprint.md        # UI mockups and layout guidelines
```

---

## 🌐 Backend Integration

The chatbot communicates with a backend API (ADK-powered) to retrieve AI-generated schedule suggestions.

### 🔁 Endpoint

```http
POST http://127.0.0.1:8003/run
```

### 📤 Request Payload

```json
{
  "message": "Can you give me a schedule with no early morning classes?",
  "session_id": "optional-session-id",
  "context": {
    "user_id": "current_user"
  }
}
```

### 📥 Response Payload

```json
{
  "session_id": "UUID",
  "status": "success",
  "message": "Okay, I have a final schedule for you!",
  "state": {
    "student_details": { ... },
    "selected_courses": { ... },
    "final_schedule": {
      "CS193": {
        "Name": "CS193",
        "CRN": "22914",
        "Schedule_Type": "RES",
        "Days": {
          "Monday": [],
          "Tuesday": [],
          "Wednesday": [],
          "Thursday": [],
          "Friday": [],
          "Saturday": [],
          "Sunday": []
        }
      },
      "EE120B": {
        "Name": "EE120B",
        "CRN": "32742",
        "Schedule_Type": "DIS",
        "Days": {
          "Wednesday": ["1100", "1150"]
        }
      }
    }
  }
}
```

### 📌 `final_schedule` Schema

| Field           | Description                             |
| --------------- | --------------------------------------- |
| `Name`          | Course ID (e.g., `"CS193"`)             |
| `CRN`           | Course reference number                 |
| `Schedule_Type` | Type (e.g., `"LEC"`, `"DIS"`, `"RES"`)  |
| `Days`          | Map of weekday to array of time strings |

Time strings use military format (`"HHMM"`) and are converted to `"HH:MM"` in the frontend.

### 🖧 Backend–Frontend Communication

The following diagram illustrates the complete system workflow:

![System workflow](./docs/images/Communication%20Diagrams.jpeg)

1. **User Interaction**

   - The user enters a message in the chatbot input field within the Chat View.

2. **Request Construction**

   - The frontend captures the input and creates a POST request payload containing:
     - `message` — the user’s query or request
     - `session_id` — identifies the active session (optional for new sessions)
     - `context` — includes metadata such as `user_id`

3. **API Request**

   - The request is sent to the backend API endpoint:
     ```http
     POST http://127.0.0.1:8003/run
     ```

4. **Backend Reception**

   - The backend server receives the request and extracts `session_id`, `user_id`, and `message`.

5. **Session Retrieval**

   - The **Runner** locates the session in the `InMemorySessionService` using the provided `session_id`.

6. **Main Coordinator Processing**

   - The Runner forwards the message to the **Main Coordinator Agent** (Gemini LLM).
   - The Coordinator determines the appropriate action and routes the request to the correct ADK agent (e.g., **Talkative Agent**, **Scheduler Agent**).

7. **Agent Execution**

   - The selected ADK agent performs the required operations, which may involve tools such as querying Google BigQuery.

8. **Response Generation**

   - The agent returns its output to the Coordinator, which passes it back to the FastAPI wrapper.

9. **Response Packaging**

   - The FastAPI wrapper formats the result into a structured JSON response using **Pydantic**:
     ```json
     {
       "session_id": "string",
       "status": "success",
       "message": "string",
       "state": { ... }
     }
     ```

10. **Return to Frontend**

    - The packaged JSON response is sent back to the frontend.

11. **Frontend Rendering**
    - The frontend extracts `final_schedule` from the `state` field.
    - Helper functions parse time strings (`"HHMM"` → `"HH:MM"`) and map weekdays.
    - The Calendar View is updated with the schedule, and the Chat View displays the LLM’s message.

---

## 🔧 Local Development

### Prerequisites

- Node.js 20+
- npm, yarn, or pnpm

### Setup

```bash
npm install
npm run dev
```

Visit: `http://localhost:9002`

---

## 🔗 Links

- [Schedule Recommender — Backend Codebase](https://github.com/Shikhar16078/dsf_backend_adk)
