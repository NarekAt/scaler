# SYSTEM DESIGN CHAOS SIMULATOR - MASTER CONTEXT (V3)

## 1. Project Overview
This project is a local-first, interactive System Design Interview Simulator. Users draw architectures in Excalidraw, an AI Tutor reviews them, interrogates the user for configuration details, and a Python orchestrator translates the design into a live, resource-constrained Docker network where synthetic load and network faults are applied.

## 2. The Tech Stack
* **Frontend:** Next.js (App Router), React, Tailwind CSS.
* **Canvas:** `@excalidraw/excalidraw` (Strictly Client-Side via `dynamic` imports).
* **Telemetry UI:** `recharts` (Fed by WebSockets).
* **AI Integration:** Vercel AI SDK (`ai`, `@ai-sdk/anthropic`), Claude 3.5 Sonnet (Vision), `zod` for strict schema enforcement.
* **Backend Orchestrator:** Python, FastAPI, `docker` (Python SDK), `websockets`.
* **Chaos & Infrastructure:** Docker Desktop, Shopify Toxiproxy, k6 (Load Testing).
* **Compute Templates:** Go (Golang) for highly concurrent, parameter-driven synthetic workers.

---

## 3. Core Architectural Principles (The Golden Rules)

### A. Template-Driven Infrastructure
* The LLM NEVER writes raw `docker-compose.yml` files, shell scripts, or custom application code.
* The LLM outputs a strict JSON Topology graph via Zod tool calling. FastAPI maps this JSON to pre-built Docker "Lego Blocks".

### B. The Sidecar Proxy Pattern (Chaos Engineering)
* Worker nodes NEVER connect directly to database nodes. 
* Every data node provisioned by FastAPI MUST have a dedicated `toxiproxy` container. All traffic routes through Toxiproxy, allowing the backend to inject deterministic latency, bandwidth throttling, and packet drops via the Toxiproxy HTTP API.

### C. Proportional Downsampling (The Illusion of Scale)
* We use a `local_scale_factor`. If the target is 100k QPS but the local container is artificially constrained (`mem_limit` and `--cpus`) to break at 1,000 QPS, the scale factor is 100. The FastAPI WebSocket layer multiplies raw Prometheus metrics by 100 before streaming to the UI.

### D. Absolute Resource Cleanup
* All FastAPI Docker orchestration MUST use `try/finally` blocks to guarantee `container.stop()` and `container.remove()` on failure, session end, or backend shutdown.

---

## 4. The Synthetic Templates (Compute & Specialized Storage)

We simulate architecture nodes using generic, highly parameterized Go binaries. These do not execute real business logic; they generate **Synthetic Behavior** based on injected Environment Variables.

**Standard Compute Archetypes:**
1. **API Gateway (`sim-gateway`)**: Ingress, rate limiting, and circuit breaking.
2. **Synchronous Worker (`sim-sync-worker`)**: Simulates REST/gRPC microservices.
    * *Params:* `WORKER_CONCURRENCY_MODEL`, `WORKER_MAX_THREADS`, `WORKER_CACHE_ENABLED`.
3. **Async Consumer (`sim-async-worker`)**: Simulates message queue consumers (Kafka/RabbitMQ).

**Advanced & Specialized Archetypes:**
4. **Stateful Connection Manager (`sim-websocket-gateway`)**: Simulates millions of persistent TCP connections for chat apps.
    * *Params:* `WS_MAX_CONNECTIONS`, `WS_MEMORY_PER_CONNECTION_KB`, `WS_HEARTBEAT_INTERVAL_MS`.
5. **Blob Storage Emulator (`sim-blob-storage`)**: Simulates S3/GCS bandwidth without using real disk space.
    * *Params:* `BLOB_MAX_BANDWIDTH_MBPS`, `BLOB_LATENCY_TIER`.
6. **Stream Processor (`sim-stream-processor`)**: Simulates Flink/Spark tumbling windows and stateful aggregation.
    * *Params:* `STREAM_WINDOW_SIZE_MS`, `STREAM_STATE_MEMORY_MB`, `STREAM_CPU_COST_PER_EVENT`.
7. **Search Engine Emulator (`sim-search-engine`)**: Simulates Elasticsearch index scaling and fuzzy text CPU burn.
    * *Params:* `SEARCH_INDEX_SIZE_GB`, `SEARCH_CACHE_HIT_RATIO`.
8. **Load Balancer (`sim-load-balancer`)**: L4/L7 routing algorithms and TLS termination bottlenecks.
    * *Params:* `LB_ALGORITHM` (round_robin, ip_hash), `LB_TLS_TERMINATION_ENABLED`.

---

## 5. The API Contract (Zod & Pydantic)
The bridge between the LLM and the Python Orchestrator is the **TopologySchema**.
* **Nodes:** Must include `compute_config` or `data_config` depending on their category.
* **Edges:** Must include `is_synchronous` (boolean) to tell Go workers whether to block the thread waiting for a response, or fire-and-forget.
* **Load Profile:** The JSON payload includes a `load_profile` (Target QPS, Read/Write Ratio, Spiky vs Steady) which FastAPI uses to dynamically generate a `k6` testing script.

---

## 6. The LLM Interrogation Protocol (State Machine)
The Next.js AI prompt must enforce a conversational state machine BEFORE triggering deployment:
1. **Discovery State:** Parse Excalidraw PNG. Identify abstract nodes.
2. **Interrogation State:** If the user draws a generic "Service," the LLM MUST ask the user how to configure it (concurrency, caching, timeouts) based on the available parameters before proceeding.
3. **Execution State:** Once all parameters are gathered, the LLM triggers the `deploy_to_simulator` Zod tool, passing the complete JSON graph to FastAPI.

---

## 7. Implementation Data Flow
1. **The Request:** Next.js UI -> Vercel AI SDK -> Claude Vision -> Zod Tool Call -> `POST /api/orchestrate/start` (FastAPI).
2. **The Orchestration:** Parse JSON -> Boot `sim_net` -> Boot Data/Storage Nodes -> Boot Toxiproxies -> Boot Go Compute Nodes -> Generate k6 Script -> Boot k6.
3. **The Telemetry & Chaos:** k6 blasts entry point -> System processes load -> Prometheus scrapes metrics -> FastAPI applies `scale_factor` -> Streams via WebSockets -> Next.js UI updates.
