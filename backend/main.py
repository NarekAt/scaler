from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from models import Topology
from orchestrator import SimulationSession
from telemetry import collect_session_metrics
from toxiproxy import register_proxy
from config import STATS_INTERVAL_SECONDS

active_session: SimulationSession | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    global active_session
    if active_session:
        active_session.teardown()
        active_session = None


app = FastAPI(title="Chaos Simulator Orchestrator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/sessions")
async def create_session(topology: Topology):
    """Receive topology JSON, boot containers, return session info."""
    global active_session

    if active_session:
        active_session.teardown()

    active_session = SimulationSession(topology)
    info = active_session.boot()

    # Register Toxiproxy upstreams for each data node sidecar
    for node_id, sidecar in list(active_session.sidecar_containers.items()):
        node = next(n for n in topology.nodes if n.id == node_id)
        target_name = active_session.containers[node_id].name
        try:
            await register_proxy(
                toxiproxy_host=sidecar.name,
                proxy_name=f"proxy-{node_id}",
                upstream_host=target_name,
                technology=node.technology.value,
            )
        except Exception:
            pass  # Proxy registration is best-effort; containers are still running

    return info


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Tear down a simulation session."""
    global active_session
    if active_session and active_session.session_id == session_id:
        active_session.teardown()
        active_session = None
        return {"status": "cleaned_up"}
    return {"status": "not_found"}


@app.websocket("/ws/telemetry/{session_id}")
async def telemetry_ws(websocket: WebSocket, session_id: str):
    """Stream container stats to the frontend Dashboard."""
    await websocket.accept()
    try:
        while True:
            if active_session and active_session.session_id == session_id:
                metrics = await collect_session_metrics(active_session.containers)
                await websocket.send_json(metrics)
            await asyncio.sleep(STATS_INTERVAL_SECONDS)
    except WebSocketDisconnect:
        pass


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "active_session": active_session.session_id if active_session else None,
    }
