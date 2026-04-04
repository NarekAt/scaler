from __future__ import annotations

from pydantic import BaseModel
from enum import Enum
from typing import Optional


class Category(str, Enum):
    compute = "compute"
    database = "database"
    broker = "broker"
    gateway = "gateway"
    storage = "storage"
    search = "search"
    stream_processor = "stream_processor"


class Technology(str, Enum):
    postgres = "postgres"
    cassandra = "cassandra"
    redis = "redis"
    kafka = "kafka"
    go_worker = "go_worker"
    websocket_gateway = "websocket_gateway"
    blob_storage = "blob_storage"
    stream_processor = "stream_processor"
    search_engine = "search_engine"
    load_balancer = "load_balancer"


class Protocol(str, Enum):
    grpc = "grpc"
    http = "http"
    tcp = "tcp"
    amqp = "amqp"
    websocket = "websocket"


class ConcurrencyModel(str, Enum):
    thread_pool = "thread_pool"
    async_event_loop = "async_event_loop"


class EvictionPolicy(str, Enum):
    lru = "lru"
    lfu = "lfu"
    none = "none"


class Persistence(str, Enum):
    disk = "disk"
    in_memory = "in_memory"


class TrafficPattern(str, Enum):
    steady = "steady"
    spiky = "spiky"
    gradual_ramp = "gradual_ramp"


class LBAlgorithm(str, Enum):
    round_robin = "round_robin"
    ip_hash = "ip_hash"
    least_connections = "least_connections"


class LatencyTier(str, Enum):
    local = "local"
    regional = "regional"
    cross_region = "cross_region"


# --- Config schemas ---

class CacheConfig(BaseModel):
    enabled: bool = False
    eviction_policy: EvictionPolicy = EvictionPolicy.none


class ComputeConfig(BaseModel):
    concurrency_model: ConcurrencyModel
    max_concurrent_requests: int = 100
    timeout_ms: int = 3000
    cache: Optional[CacheConfig] = None


class DataConfig(BaseModel):
    persistence: Persistence
    replication_factor: int = 1


class WebSocketConfig(BaseModel):
    max_connections: int = 100000
    memory_per_connection_kb: int = 4
    heartbeat_interval_ms: int = 30000


class BlobStorageConfig(BaseModel):
    max_bandwidth_mbps: int = 100
    latency_tier: LatencyTier = LatencyTier.regional


class StreamProcessorConfig(BaseModel):
    window_size_ms: int = 5000
    state_memory_mb: int = 128
    cpu_cost_per_event: float = 0.1


class SearchEngineConfig(BaseModel):
    index_size_gb: float = 10.0
    cache_hit_ratio: float = 0.8


class LoadBalancerConfig(BaseModel):
    algorithm: LBAlgorithm = LBAlgorithm.round_robin
    tls_termination_enabled: bool = False


# --- Core schemas ---

class Node(BaseModel):
    id: str
    category: Category
    technology: Technology
    compute_config: Optional[ComputeConfig] = None
    data_config: Optional[DataConfig] = None
    websocket_config: Optional[WebSocketConfig] = None
    blob_storage_config: Optional[BlobStorageConfig] = None
    stream_processor_config: Optional[StreamProcessorConfig] = None
    search_engine_config: Optional[SearchEngineConfig] = None
    load_balancer_config: Optional[LoadBalancerConfig] = None


class Edge(BaseModel):
    source: str
    target: str
    protocol: Protocol
    is_synchronous: bool


class LoadProfile(BaseModel):
    entry_point_node_id: str
    target_qps: int
    read_write_ratio: str = "50/50"
    traffic_pattern: TrafficPattern


class Topology(BaseModel):
    session_id: str
    load_profile: LoadProfile
    nodes: list[Node]
    edges: list[Edge]
