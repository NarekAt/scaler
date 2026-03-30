# SYSTEM DESIGN CHAOS SIMULATOR - MASTER CONTEXT

## 1. Project Overview
This project is a local-first, interactive System Design Interview Simulator. It bridges the gap between high-level architectural drawing and real-world infrastructure chaos. Users draw architectures in Excalidraw, an AI Tutor reviews them, and a local Python orchestrator translates the design into a live, resource-constrained Docker network where simulated network faults (chaos) and load tests are applied.

## 2. The Tech Stack
* **Frontend:** Next.js (App Router), React, Tailwind CSS.
* **Canvas:** `@excalidraw/excalidraw` (Strictly Client-Side via `dynamic` imports).
* **Telemetry UI:** `recharts` (Fed by WebSockets).
* **AI Integration:** Vercel AI SDK (`ai`, `@ai-sdk/anthropic`), Claude 3.5 Sonnet (Vision), `zod` for strict schema enforcement.
* **Backend Orchestrator:** Python, FastAPI, `docker` (Python SDK), `websockets`.
* **Chaos & Infrastructure:** Docker Desktop, Shopify Toxiproxy, generic pre-built images (Cassandra, Postgres, Redis, k6).

---

## 3. Core Architectural Principles (The Golden Rules)

When writing code for this project, the AI assistant MUST adhere to these absolute constraints:

### A. Template-Driven Infrastructure (No LLM Shell Scripting)
* **Rule:** The LLM does NOT write raw `docker-compose.yml` files, shell scripts, or custom C++ code on the fly. 
* **Implementation:** The LLM is strictly constrained to outputting a JSON Topology graph (Nodes and Edges) via Zod tool calling. The FastAPI backend maps this JSON to predefined, static Docker "Lego Blocks" (e.g., `cassandra:latest`).

### B. The Sidecar Proxy Pattern (Chaos Engineering)
* **Rule:** Worker nodes NEVER connect directly to database nodes. 
* **Implementation:** Every data node provisioned by FastAPI MUST be accompanied by a dedicated `toxiproxy` container. All traffic routes through Toxiproxy, allowing the backend to inject deterministic latency, bandwidth throttling, and packet drops without modifying the database containers.

### C. Proportional Downsampling (The Illusion of Scale)
* **Rule:** We do not actually simulate 100,000 QPS on a local laptop.
* **Implementation:** The system uses a `local_scale_factor`. If the target is 100k QPS but the local container is artificially constrained (via Docker `mem_limit` and `--cpus`) to break at 1,000 QPS, the scale factor is 100. The FastAPI WebSocket layer multiplies the raw Prometheus metrics by 100 before sending them to the UI.

### D. Absolute Resource Cleanup
* **Rule:** No zombie containers left on the user's host machine.
* **Implementation:** All FastAPI Docker orchestration MUST use `try/finally` blocks to guarantee `container.stop()` and `container.remove()` on failure, session end, or backend shutdown.

---

## 4. Current Component State & Data Flow

### The Frontend (Next.js)
1.  **Layout:** CSS Grid layout with Excalidraw (Main), AI Chat (Sidebar), and Recharts Dashboard (Bottom Footer).
2.  **Vision Pipeline:** When the user chats, the UI silently calls Excalidraw's `exportToBlob`, converts the canvas to a Base64 PNG, and attaches it to the Vercel AI SDK payload.
3.  **Strict Handoff:** The Next.js API route (`/api/chat`) uses a Zod tool (`deploy_to_simulator`). When the user asks to deploy, the LLM executes this tool, generating the strict `TopologySchema` JSON, which Next.js forwards to FastAPI.

### The Backend (FastAPI)
1.  **Orchestrator:** Listens for the Topology JSON. Iterates through the `nodes` and uses `docker_client.containers.run` to boot the target images and their Toxiproxy sidecars on an isolated bridge network.
2.  **Telemetry:** Opens a WebSocket connection to the Next.js UI, streaming high-frequency JSON payloads (e.g., `{ "latency": 45, "cpu": 82 }`) to animate the Recharts dashboard.

---

## 5. Upcoming Implementation Paths

The AI assistant should be prepared to assist with the following upcoming milestones:

* **Path 1: Toxiproxy API Wrapper (Python):** Building the Python functions in FastAPI to send HTTP `POST` requests to the Toxiproxy containers to inject Toxics (latency spikes, connection cuts) based on UI button clicks.
* **Path 2: The Load Generator (k6):** Dynamically writing a localized `k6` JavaScript script based on the API endpoints defined in the LLM topology, and spinning up a k6 Docker container to blast the entry point.
* **Path 3: Scenario Manifests:** Implementing the JSON-based "Scenario Manifest" system so that specific interview questions (e.g., "Design a Job Scheduler") automatically load predefined Recharts dashboards and expected failure thresholds.
