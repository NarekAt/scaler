# System Architecture

## High-Level Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION                         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                        gRPC ScheduleJob
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  SUBMITTER SERVICE      │
                    │  (Port 50051)           │
                    │                         │
                    │  • Validate job         │
                    │  • Generate job ID      │
                    │  • Store in Cassandra   │
                    └────────────┬────────────┘
                                 │
                          INSERT scheduled_jobs
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   CASSANDRA CLUSTER     │
                    │                         │
                    │  scheduled_jobs {       │
                    │    minute_bucket        │
                    │    scheduled_time       │
                    │    job_id               │
                    │    payload              │
                    │  }                      │
                    │                         │
                    │  job_executions {       │
                    │    job_id               │
                    │    status               │
                    │    started_at           │
                    │    completed_at         │
                    │  }                      │
                    └────────────┬────────────┘
                                 │
                         POLL every 5 seconds
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  WATCHER SERVICE        │
                    │                         │
                    │  • Query Cassandra      │
                    │    for upcoming jobs    │
                    │  • Look ahead 30 secs   │
                    │  • Batch size: 100      │
                    │  • Publish to Redis     │
                    └────────────┬────────────┘
                                 │
                       ZADD tasks_queue
                       (score = scheduled_time)
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    REDIS DATABASE       │
                    │                         │
                    │  Sorted Sets:           │
                    │  • tasks_queue {        │
                    │      member: task JSON  │
                    │      score: timestamp   │
                    │    }                    │
                    │                         │
                    │  Pub/Sub Channels:      │
                    │  • execution_results    │
                    └────────────┬────────────┘
                                 │
                       BZPOPMIN (blocking)
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  WORKER SERVICE(s)      │
                    │  (Horizontally scaled)  │
                    │                         │
                    │  • Pop task from Redis  │
                    │  • Parse payload        │
                    │  • Execute task         │
                    │  • Track timing         │
                    │  • Update Cassandra     │
                    │  • Publish result       │
                    └─────────────────────────┘
                                 │
                    UPDATE job_executions
                    PUBLISH execution_results
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   CASSANDRA CLUSTER     │
                    │                         │
                    │ Job execution status    │
                    │ Result tracking         │
                    │ Audit trail             │
                    └─────────────────────────┘
```

## Data Flow - Complete Job Lifecycle

### 1. Job Submission Phase
```
Client → Submitter (gRPC)
         ↓
    Validate payload
         ↓
    Generate UUID for job_id
         ↓
    Insert into Cassandra:
    INSERT INTO scheduled_jobs (
        minute_bucket = '2026-03-07-14:30',
        scheduled_time = 1741351200000,
        job_id = uuid,
        payload = '{"action": "process"}' 
    )
         ↓
    Return (job_id, status='PENDING')
```

### 2. Polling Phase
```
Watcher runs every 5 seconds:
         ↓
    Calculate current minute_bucket
         ↓
    Query Cassandra:
    SELECT * FROM scheduled_jobs
    WHERE minute_bucket = '2026-03-07-14:30'
    AND scheduled_time >= now
    AND scheduled_time <= now + 30 seconds
    LIMIT 100
         ↓
    Iterate results:
         ↓
    For each job:
        ZADD tasks_queue <scheduled_time> <job_json>
         ↓
    Log: "Published 47 jobs to Redis"
```

### 3. Task Execution Phase
```
Worker (one or more instances):
         ↓
    BZPOPMIN tasks_queue (blocks with 5s timeout)
         ↓
    Task received ✓
         ↓
    Extract job_id from task JSON
         ↓
    started_at = current_time_ms
         ↓
    Execute task:
         ├─ Parse payload
         ├─ Determine task type
         ├─ Call appropriate handler
         └─ Get result
         ↓
    completed_at = current_time_ms
         ↓
    Determine status (COMPLETED or FAILED)
         ↓
    UPDATE job_executions
    WHERE job_id = uuid
    SET status = 'COMPLETED',
        started_at = ...,
        completed_at = ...
         ↓
    PUBLISH execution_results
    MESSAGE: {"job_id": uuid, "success": true, "result": "..."}
         ↓
    Log: "Task <job_id> completed in 250ms"
```

## Partition Strategy - Why Minute Buckets?

### Problem
- Cassandra distributes data by partition key
- Without good partitioning, all writes go to one node
- Without temporal batching, queries would span multiple partitions

### Solution: Minute Bucket (`YYYY-MM-DD-HH:MM`)
```
Time          Partition Key
14:00:00  →  "2026-03-07-14:00"  ┐
14:00:15  →  "2026-03-07-14:00"  ├─ Same partition
14:00:59  →  "2026-03-07-14:00"  ┤  (same node)
14:01:00  →  "2026-03-07-14:01"  ┘
14:01:15  →  "2026-03-07-14:01"  ← Different partition
```

### Benefits
✓ Balanced distribution across cluster
✓ Range queries efficient (single partition per minute)
✓ Easy time-based bucketing
✓ Natural cleanup/TTL strategy

### Clustering Order
Within each minute partition, rows are sorted by `scheduled_time`:
```
Partition "2026-03-07-14:00":
  scheduled_time: 1741351200000, job_id: uuid-1, payload: "..."
  scheduled_time: 1741351205000, job_id: uuid-2, payload: "..."
  scheduled_time: 1741351215000, job_id: uuid-3, payload: "..."
  scheduled_time: 1741351230000, job_id: uuid-4, payload: "..."
  ↑                                                              ↑
  Scan from here                                        Efficient range query
```

## Redis Sorted Set Design

### Why Sorted Sets?
```
Standard list:  [job1, job2, job3, job4, job5]
                No ordering, FIFO only

Sorted Set:     job1 [score: 1741351200000]
                job2 [score: 1741351205000]
                job3 [score: 1741351215000]
                job4 [score: 1741351230000]
                job5 [score: 1741351245000]
                      ↓
                   Always ordered by time
                   (natural scheduling order)
```

### Operations on Sorted Set
```cpp
// Watcher: Add new task
ZADD tasks_queue 1741351200000 '{"job_id": "...", "payload": "..."}'
                  └─ score (timestamp)

// Worker: Pop earliest task
BZPOPMIN tasks_queue 5  // Block 5 seconds
→ Returns: [key, member, score]
   where member is earliest task

// Monitor: View queue status
ZRANGE tasks_queue 0 -1 WITHSCORES
→ All tasks with their scheduled times
```

## Scaling Model

### Horizontal Scaling
```
Initial Setup:
  ┌─────────────┐
  │  Submitter  │ (handles job submissions)
  └─────────────┘
  
  ┌─────────────┐
  │   Watcher   │ (polls Cassandra)
  └─────────────┘
  
  ┌─────────────┐
  │   Worker    │ (processes 1 task/min)
  └─────────────┘

High Load → Add Workers:
  ┌─────────────┐
  │   Worker 1  │ ┐
  └─────────────┘ │
  
  ┌─────────────┐ │  All pulling from
  │   Worker 2  │ ├─ same Redis queue
  └─────────────┘ │  (load balanced)
  
  ┌─────────────┐ │
  │   Worker 3  │ │
  └─────────────┘ │
  
  ┌─────────────┐ │
  │   Worker N  │ ┘
  └─────────────┘
```

### Scale Testing Example
```bash
# Start with 5 workers
docker-compose up --scale worker=5

# Submit 500 jobs
for i in {1..500}; do
  grpcurl -d "{...}" JobScheduler/ScheduleJob localhost:50051
done

# Monitor Redis queue depth
watch 'redis-cli ZCARD tasks_queue'

# If queue grows, add more workers
docker-compose up --scale worker=10

# Monitor worker logs
docker-compose logs -f worker | grep completed
```

## Failure Scenarios & Handling

### Scenario 1: Worker Crashes Mid-Execution
```
Worker 1 pops task from Redis (removed immediately)
         │
         ├─ Starts executing
         │
         └─ CRASH! (before sending result)

Result: Task lost (not in Redis, not in Cassandra status)

Solution (TODO):
  1. Use ACK pattern: move to "processing" queue
  2. Set timeout on processing queue
  3. Re-add to tasks_queue if timeout exceeded
```

### Scenario 2: Cassandra Down During Poll
```
Watcher tries to query Cassandra
         ├─ Connection fails
         ├─ Logs error
         └─ Retries next cycle (5 seconds later)

During outage: Tasks delayed but not lost
After recovery: Watcher catches up on next poll
```

### Scenario 3: Redis Queue Full
```
Watcher tries to publish job
    ├─ Memory limit exceeded
    ├─ Write fails
    ├─ Logs error
    └─ Job remains in Cassandra

Solution: Monitor queue size, alert ops if growing
         Add more workers or increase Redis memory
```

### Scenario 4: Duplicate Job Publishing
```
Network hiccup during publishing:
  Watcher gets timeout on ZADD
  Doesn't know if write succeeded
  Retries in next cycle
  
Result: Same job published twice

Solution (TODO):
  1. Track published jobs in Redis with TTL
  2. Check before publishing
  3. Idempotent operations
```

## Monitoring Points

```
Submission Rate:
  Submitter requests/sec → metrics endpoint

Queue Depth:
  redis-cli ZCARD tasks_queue

Processing Rate:
  Worker completed tasks/sec → metrics endpoint

Latency:
  scheduled_time → started_at → completed_at
  (E2E job latency)

Error Rate:
  Worker failures / total jobs

Cassandra Query Time:
  Watcher query duration → metrics

Redis Operation Time:
  ZADD, BZPOPMIN latency
```

## Cost Optimization

```
Current Setup (single-region):
  1x Cassandra node
  1x Redis instance  
  1x Submitter (gRPC)
  1x Watcher (polling)
  N x Workers (horizontal)

Costs Scale:
  • Submitter: Fixed cost (CPU-constrained)
  • Watcher: Low cost (I/O-bound, cached)
  • Cassandra: Scales with data retention period
  • Redis: Scales with queue depth
  • Workers: Linear with job volume

Optimization Opportunities:
  1. Use minute bucket TTL to auto-expire old jobs
  2. Batch Cassandra writes (worker updates)
  3. Tune polling frequency based on queue depth
  4. Cache Cassandra queries within watcher
  5. Use Redis memory efficiently (compression)
```
