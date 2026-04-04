import { z } from "zod";

// --- Compute node configs ---

const ComputeConfigSchema = z.object({
  concurrency_model: z
    .enum(["thread_pool", "async_event_loop"])
    .describe("How the worker handles simultaneous requests."),
  max_concurrent_requests: z.number().min(1).max(10000).default(100)
    .describe("Hard limit on simultaneous connections before 503s."),
  timeout_ms: z.number().min(10).max(30000).default(3000)
    .describe("Timeout for downstream calls in ms."),
  cache: z.object({
    enabled: z.boolean().default(false),
    eviction_policy: z.enum(["lru", "lfu", "none"]).default("none"),
  }).optional(),
});

// --- Specialized archetype configs ---

const WebSocketGatewayConfigSchema = z.object({
  max_connections: z.number().min(1).max(10_000_000).default(100000)
    .describe("Maximum persistent TCP/WebSocket connections."),
  memory_per_connection_kb: z.number().min(1).max(1024).default(4)
    .describe("Memory allocated per connection in KB."),
  heartbeat_interval_ms: z.number().min(100).max(60000).default(30000)
    .describe("Interval between keepalive heartbeats."),
});

const BlobStorageConfigSchema = z.object({
  max_bandwidth_mbps: z.number().min(1).max(10000).default(100)
    .describe("Maximum bandwidth in Mbps for uploads/downloads."),
  latency_tier: z.enum(["local", "regional", "cross_region"]).default("regional")
    .describe("Simulated network latency tier to the storage backend."),
});

const StreamProcessorConfigSchema = z.object({
  window_size_ms: z.number().min(100).max(3600000).default(5000)
    .describe("Tumbling window size in ms for stateful aggregation."),
  state_memory_mb: z.number().min(1).max(4096).default(128)
    .describe("Memory budget for in-flight state."),
  cpu_cost_per_event: z.number().min(0.001).max(100).default(0.1)
    .describe("Synthetic CPU burn per event processed."),
});

const SearchEngineConfigSchema = z.object({
  index_size_gb: z.number().min(0.1).max(1000).default(10)
    .describe("Simulated index size in GB (affects query latency)."),
  cache_hit_ratio: z.number().min(0).max(1).default(0.8)
    .describe("Fraction of queries served from cache (0.0–1.0)."),
});

const LoadBalancerConfigSchema = z.object({
  algorithm: z.enum(["round_robin", "ip_hash", "least_connections"]).default("round_robin")
    .describe("Load balancing algorithm."),
  tls_termination_enabled: z.boolean().default(false)
    .describe("Whether TLS termination is performed at this layer."),
});

// --- Data node config ---

const DataConfigSchema = z.object({
  persistence: z.enum(["disk", "in_memory"])
    .describe("Whether data survives a container restart."),
  replication_factor: z.number().min(1).max(5).default(1)
    .describe("Number of instances for cluster simulations."),
});

// --- Node schema ---

const NodeSchema = z.object({
  id: z.string()
    .describe("A unique, lowercase identifier (e.g., 'user_db', 'payment_api')."),
  category: z.enum(["compute", "database", "broker", "gateway", "storage", "search", "stream_processor"])
    .describe("The architectural role of this node."),
  technology: z.enum([
    "postgres", "cassandra", "redis", "kafka",
    "go_worker", "websocket_gateway", "blob_storage",
    "stream_processor", "search_engine", "load_balancer",
  ]).describe("The specific template/technology to provision."),
  compute_config: ComputeConfigSchema.optional(),
  data_config: DataConfigSchema.optional(),
  websocket_config: WebSocketGatewayConfigSchema.optional(),
  blob_storage_config: BlobStorageConfigSchema.optional(),
  stream_processor_config: StreamProcessorConfigSchema.optional(),
  search_engine_config: SearchEngineConfigSchema.optional(),
  load_balancer_config: LoadBalancerConfigSchema.optional(),
});

// --- Edge schema ---

const EdgeSchema = z.object({
  source: z.string().describe("The ID of the originating node."),
  target: z.string().describe("The ID of the destination node."),
  protocol: z.enum(["grpc", "http", "tcp", "amqp", "websocket"])
    .describe("The network protocol used for this connection."),
  is_synchronous: z.boolean()
    .describe("True if the source blocks waiting for a response. False for fire-and-forget."),
});

// --- Load profile ---

const LoadProfileSchema = z.object({
  entry_point_node_id: z.string()
    .describe("The ID of the entry node where k6 sends traffic."),
  target_qps: z.number().min(1).max(1000000)
    .describe("The simulated Queries Per Second."),
  read_write_ratio: z.string().regex(/^\d{1,3}\/\d{1,3}$/).default("50/50")
    .describe("Read vs write ratio (e.g., '80/20')."),
  traffic_pattern: z.enum(["steady", "spiky", "gradual_ramp"])
    .describe("How traffic is applied."),
});

// --- Master topology ---

export const TopologySchema = z.object({
  session_id: z.string().describe("A unique identifier for this simulation run."),
  load_profile: LoadProfileSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type Topology = z.infer<typeof TopologySchema>;
