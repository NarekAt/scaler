from __future__ import annotations

import docker
from docker.models.containers import Container

from models import Topology, Node
from config import (
    IMAGE_MAP,
    TOXIPROXY_IMAGE,
    RESOURCE_LIMITS,
    ENV_MAP,
    DATA_TECHNOLOGIES,
    NETWORK_PREFIX,
)


def _build_specialized_env(node: Node) -> dict[str, str]:
    """Build ENV vars from any config attached to the node."""
    env: dict[str, str] = {}

    if cfg := node.compute_config:
        env["WORKER_CONCURRENCY_MODEL"] = cfg.concurrency_model.value
        env["WORKER_MAX_THREADS"] = str(cfg.max_concurrent_requests)
        env["WORKER_TIMEOUT_MS"] = str(cfg.timeout_ms)
        if cfg.cache and cfg.cache.enabled:
            env["WORKER_CACHE_ENABLED"] = "true"
            env["WORKER_CACHE_EVICTION"] = cfg.cache.eviction_policy.value
        else:
            env["WORKER_CACHE_ENABLED"] = "false"

    if cfg := node.websocket_config:
        env["WS_MAX_CONNECTIONS"] = str(cfg.max_connections)
        env["WS_MEMORY_PER_CONNECTION_KB"] = str(cfg.memory_per_connection_kb)
        env["WS_HEARTBEAT_INTERVAL_MS"] = str(cfg.heartbeat_interval_ms)

    if cfg := node.blob_storage_config:
        env["BLOB_MAX_BANDWIDTH_MBPS"] = str(cfg.max_bandwidth_mbps)
        env["BLOB_LATENCY_TIER"] = cfg.latency_tier.value

    if cfg := node.stream_processor_config:
        env["STREAM_WINDOW_SIZE_MS"] = str(cfg.window_size_ms)
        env["STREAM_STATE_MEMORY_MB"] = str(cfg.state_memory_mb)
        env["STREAM_CPU_COST_PER_EVENT"] = str(cfg.cpu_cost_per_event)

    if cfg := node.search_engine_config:
        env["SEARCH_INDEX_SIZE_GB"] = str(cfg.index_size_gb)
        env["SEARCH_CACHE_HIT_RATIO"] = str(cfg.cache_hit_ratio)

    if cfg := node.load_balancer_config:
        env["LB_ALGORITHM"] = cfg.algorithm.value
        env["LB_TLS_TERMINATION_ENABLED"] = str(cfg.tls_termination_enabled).lower()

    return env


class SimulationSession:
    """Manages all Docker resources for one simulation run."""

    def __init__(self, topology: Topology):
        self.topology = topology
        self.session_id = topology.session_id
        self.client = docker.from_env()
        self.network: docker.models.networks.Network | None = None
        self.containers: dict[str, Container] = {}
        self.sidecar_containers: dict[str, Container] = {}

    def boot(self) -> dict:
        """Create network, boot all containers. Returns session info."""
        try:
            self._create_network()
            self._boot_containers()
            return self._get_session_info()
        except Exception:
            self.teardown()
            raise

    def _create_network(self):
        net_name = f"{NETWORK_PREFIX}-{self.session_id}"
        self.network = self.client.networks.create(net_name, driver="bridge")

    def _boot_containers(self):
        for node in self.topology.nodes:
            tech = node.technology.value
            image = IMAGE_MAP.get(tech)
            if image is None:
                continue

            container_name = f"sim-{self.session_id}-{node.id}"
            limits = RESOURCE_LIMITS.get(tech, {})

            # Merge base ENV with any specialized config ENV vars
            env = dict(ENV_MAP.get(tech, {}))
            env.update(_build_specialized_env(node))

            container = self.client.containers.run(
                image,
                name=container_name,
                detach=True,
                network=self.network.name,
                environment=env,
                mem_limit=limits.get("mem_limit"),
                nano_cpus=limits.get("nano_cpus"),
                labels={"chaos-sim-session": self.session_id},
            )
            self.containers[node.id] = container

            # Boot Toxiproxy sidecar for data/broker nodes
            if tech in DATA_TECHNOLOGIES:
                self._boot_toxiproxy_sidecar(node.id)

    def _boot_toxiproxy_sidecar(self, node_id: str):
        sidecar_name = f"sim-{self.session_id}-{node_id}-toxiproxy"
        sidecar = self.client.containers.run(
            TOXIPROXY_IMAGE,
            name=sidecar_name,
            detach=True,
            network=self.network.name,
            labels={"chaos-sim-session": self.session_id},
            mem_limit="32m",
            nano_cpus=100_000_000,
        )
        self.sidecar_containers[node_id] = sidecar

    def teardown(self):
        """Stop and remove ALL containers and the network."""
        all_containers = list(self.containers.values()) + list(
            self.sidecar_containers.values()
        )
        for c in all_containers:
            try:
                c.stop(timeout=3)
                c.remove(force=True)
            except Exception:
                pass
        if self.network:
            try:
                self.network.remove()
            except Exception:
                pass
        self.containers.clear()
        self.sidecar_containers.clear()

    def _get_session_info(self) -> dict:
        return {
            "session_id": self.session_id,
            "network": self.network.name if self.network else None,
            "containers": {nid: c.short_id for nid, c in self.containers.items()},
            "sidecars": {
                nid: c.short_id for nid, c in self.sidecar_containers.items()
            },
        }
