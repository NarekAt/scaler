#!/usr/bin/env bash
# Manual test commands for the Chaos Simulator backend (V2 schema).
# Prerequisite: Docker Desktop running, backend running on port 8000:
#   cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000

set -e
BASE=http://localhost:8000

echo "=== Health Check ==="
curl -s "$BASE/api/health" | python3 -m json.tool

echo ""
echo "=== Create Session (V2 topology: gateway + worker + postgres + redis) ==="
RESPONSE=$(curl -s -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test0001",
    "load_profile": {
      "entry_point_node_id": "gateway-1",
      "target_qps": 50000,
      "read_write_ratio": "80/20",
      "traffic_pattern": "steady"
    },
    "nodes": [
      {
        "id": "gateway-1",
        "category": "gateway",
        "technology": "go_worker",
        "compute_config": {
          "concurrency_model": "async_event_loop",
          "max_concurrent_requests": 5000,
          "timeout_ms": 2000
        }
      },
      {
        "id": "api-1",
        "category": "compute",
        "technology": "go_worker",
        "compute_config": {
          "concurrency_model": "thread_pool",
          "max_concurrent_requests": 200,
          "timeout_ms": 3000,
          "cache": { "enabled": true, "eviction_policy": "lru" }
        }
      },
      {
        "id": "user-db",
        "category": "database",
        "technology": "postgres",
        "data_config": { "persistence": "disk", "replication_factor": 1 }
      },
      {
        "id": "session-cache",
        "category": "database",
        "technology": "redis",
        "data_config": { "persistence": "in_memory", "replication_factor": 1 }
      }
    ],
    "edges": [
      { "source": "gateway-1", "target": "api-1", "protocol": "http", "is_synchronous": true },
      { "source": "api-1", "target": "user-db", "protocol": "tcp", "is_synchronous": true },
      { "source": "api-1", "target": "session-cache", "protocol": "tcp", "is_synchronous": true }
    ]
  }')
echo "$RESPONSE" | python3 -m json.tool

SESSION_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")
echo ""
echo "Session ID: $SESSION_ID"

echo ""
echo "=== Running Containers ==="
docker ps --filter "label=chaos-sim-session" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

echo ""
echo "=== Telemetry (5 seconds of WebSocket data) ==="
echo "Connecting to ws://localhost:8000/ws/telemetry/$SESSION_ID ..."
if command -v websocat &> /dev/null; then
  timeout 5 websocat "ws://localhost:8000/ws/telemetry/$SESSION_ID" || true
else
  echo "(Install websocat to test WebSocket: brew install websocat)"
  echo "Skipping WebSocket test, waiting 5s instead..."
  sleep 5
fi

echo ""
echo "=== Teardown Session ==="
curl -s -X DELETE "$BASE/api/sessions/$SESSION_ID" | python3 -m json.tool

echo ""
echo "=== Verify Cleanup (should be empty) ==="
docker ps --filter "label=chaos-sim-session" --format "{{.Names}}"
echo "(no output = all containers cleaned up)"
