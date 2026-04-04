from __future__ import annotations

IMAGE_MAP: dict[str, str] = {
    # Data nodes
    "postgres": "postgres:16-alpine",
    "cassandra": "cassandra:4",
    "redis": "redis:7-alpine",
    "kafka": "bitnami/kafka:3.7",
    # Compute/specialized nodes (all use nginx:alpine placeholder until Go binaries are built)
    "go_worker": "nginx:alpine",
    "websocket_gateway": "nginx:alpine",
    "blob_storage": "nginx:alpine",
    "stream_processor": "nginx:alpine",
    "search_engine": "nginx:alpine",
    "load_balancer": "nginx:alpine",
}

TOXIPROXY_IMAGE = "ghcr.io/shopify/toxiproxy:2.9.0"

# Technologies that get a Toxiproxy sidecar
DATA_TECHNOLOGIES = {"postgres", "cassandra", "redis", "kafka"}

# Resource constraints per technology (proportional downsampling)
RESOURCE_LIMITS: dict[str, dict] = {
    "postgres": {"mem_limit": "128m", "nano_cpus": 500_000_000},
    "cassandra": {"mem_limit": "512m", "nano_cpus": 1_000_000_000},
    "redis": {"mem_limit": "64m", "nano_cpus": 250_000_000},
    "kafka": {"mem_limit": "256m", "nano_cpus": 500_000_000},
    "go_worker": {"mem_limit": "64m", "nano_cpus": 250_000_000},
    "websocket_gateway": {"mem_limit": "128m", "nano_cpus": 500_000_000},
    "blob_storage": {"mem_limit": "64m", "nano_cpus": 250_000_000},
    "stream_processor": {"mem_limit": "256m", "nano_cpus": 500_000_000},
    "search_engine": {"mem_limit": "256m", "nano_cpus": 500_000_000},
    "load_balancer": {"mem_limit": "64m", "nano_cpus": 250_000_000},
}

# Base environment variables per technology
ENV_MAP: dict[str, dict[str, str]] = {
    "postgres": {"POSTGRES_PASSWORD": "chaos", "POSTGRES_DB": "sim"},
    "cassandra": {},
    "redis": {},
    "kafka": {
        "KAFKA_CFG_NODE_ID": "0",
        "KAFKA_CFG_PROCESS_ROLES": "controller,broker",
        "KAFKA_CFG_CONTROLLER_QUORUM_VOTERS": "0@localhost:9093",
        "KAFKA_CFG_LISTENERS": "PLAINTEXT://:9092,CONTROLLER://:9093",
        "KAFKA_CFG_CONTROLLER_LISTENER_NAMES": "CONTROLLER",
        "ALLOW_PLAINTEXT_LISTENER": "yes",
    },
    "go_worker": {},
    "websocket_gateway": {},
    "blob_storage": {},
    "stream_processor": {},
    "search_engine": {},
    "load_balancer": {},
}

# Default listen ports for Toxiproxy proxying
PROXY_LISTEN_PORTS: dict[str, int] = {
    "postgres": 5432,
    "cassandra": 9042,
    "redis": 6379,
    "kafka": 9092,
}

LOCAL_SCALE_FACTOR = 100
TOXIPROXY_API_PORT = 8474
STATS_INTERVAL_SECONDS = 1.0
NETWORK_PREFIX = "chaos-sim"
