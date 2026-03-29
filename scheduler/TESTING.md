# Examples & Testing Guide

## Example Job Payloads

### Email Task
```json
{
  "type": "email",
  "to": "user@example.com",
  "subject": "Order Confirmation",
  "template": "order_confirmation",
  "variables": {
    "order_id": "12345",
    "customer_name": "John Doe",
    "amount": 99.99
  }
}
```

### HTTP Webhook
```json
{
  "type": "webhook",
  "url": "https://api.example.com/callbacks/order-ready",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer token123",
    "Content-Type": "application/json"
  },
  "body": {
    "event": "order_ready",
    "order_id": "12345",
    "estimated_delivery": "2026-03-15"
  }
}
```

### Database Operation
```json
{
  "type": "db_operation",
  "operation": "UPDATE",
  "table": "orders",
  "set": {
    "status": "shipped",
    "shipped_at": "2026-03-07T14:30:00Z"
  },
  "where": {
    "id": "12345"
  }
}
```

### Report Generation
```json
{
  "type": "report",
  "report_type": "daily_sales",
  "date": "2026-03-07",
  "output_format": "pdf",
  "email_to": "reports@example.com",
  "include_charts": true
}
```

### Batch Processing
```json
{
  "type": "batch",
  "operation": "process_csv",
  "file_url": "s3://bucket/data.csv",
  "handler": "import_customers",
  "batch_size": 100,
  "retry_on_error": true
}
```

## Testing Scenarios

### 1. Basic End-to-End Flow

**Setup**:
```bash
cd /Users/natayan/projects/distributed-scheduler
docker-compose up
```

**Test script** (Python):
```python
import grpc
import time
import redis
from scheduler_pb2 import ScheduleJobRequest
from scheduler_pb2_grpc import JobSchedulerStub

# Connect to services
grpc_channel = grpc.insecure_channel('localhost:50051')
grpc_stub = JobSchedulerStub(grpc_channel)
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Submit a job scheduled 10 seconds from now
future_time_ms = int((time.time() + 10) * 1000)
request = ScheduleJobRequest(
    payload='{"type": "email", "to": "test@example.com"}',
    execute_at_ms=future_time_ms
)

print("1. Submitting job...")
response = grpc_stub.ScheduleJob(request)
job_id = response.job_id
print(f"   Job ID: {job_id}")

# Wait for Watcher to pick it up (polling interval is 5 seconds)
print("2. Waiting for Watcher to poll...")
time.sleep(6)

# Check if task appeared in Redis
print("3. Checking Redis queue...")
tasks = redis_client.zrange('tasks_queue', 0, -1, withscores=True)
print(f"   Tasks in queue: {len(tasks)}")
for task, score in tasks:
    print(f"   - {task} (scheduled for {score})")

# Wait for Worker to process it
print("4. Waiting for Worker to execute...")
time.sleep(2)

# Check if task was removed from Redis
tasks = redis_client.zrange('tasks_queue', 0, -1)
print(f"5. Tasks remaining: {len(tasks)}")

print("\n✓ E2E test completed!")
```

**Expected Output**:
```
1. Submitting job...
   Job ID: 550e8400-e29b-41d4-a716-446655440000
2. Waiting for Watcher to poll...
3. Checking Redis queue...
   Tasks in queue: 1
   - {"job_id":"550e8400...", "payload":"..."} (scheduled for 1741351210000.0)
4. Waiting for Worker to execute...
5. Tasks remaining: 0

✓ E2E test completed!
```

### 2. High Volume Load Test

**Goal**: Test system under load with many jobs

```bash
#!/bin/bash

# Generate 1000 jobs scheduled at different times
for i in {1..1000}; do
  FUTURE_TIME=$(( $(date +%s) * 1000 + (i % 60) * 1000 ))
  
  grpcurl \
    -d "{
      \"payload\": \"{\\\"type\\\": \\\"test\\\", \\\"id\\\": $i}\",
      \"execute_at_ms\": $FUTURE_TIME
    }" \
    localhost:50051 \
    scheduler.JobScheduler/ScheduleJob
    
  echo "Submitted job $i"
done

# Monitor queue depth over time
watch -n 1 'redis-cli ZCARD tasks_queue'

# View worker logs to see processing rate
docker-compose logs -f worker | grep completed
```

### 3. Failover Testing

**Scenario**: Redis crashes, then recovers

```bash
# Terminal 1: Watch queue depth
watch -n 1 'redis-cli ZCARD tasks_queue'

# Terminal 2: Submit jobs continuously
while true; do
  FUTURE_TIME=$(( $(date +%s) * 1000 + 30000 ))
  grpcurl -d "{
    \"payload\": \"{\\\"test\\\": true}\",
    \"execute_at_ms\": $FUTURE_TIME
  }" localhost:50051 scheduler.JobScheduler/ScheduleJob
  sleep 1
done

# Terminal 3: Simulate Redis crash
docker stop scheduler-redis
sleep 30
docker start scheduler-redis

# Expected behavior:
# - Queue depth grows while Redis is down
# - After Redis recovers, Watcher resumes publishing
# - Workers process backlog
```

### 4. Worker Scaling Test

**Goal**: Verify load balancing across workers

```bash
# Monitor worker count
docker-compose ps | grep worker

# Scale to 1 worker
docker-compose up -d --scale worker=1

# Submit 100 jobs
for i in {1..100}; do
  FUTURE_TIME=$(( $(date +%s) * 1000 + 60000 ))
  grpcurl -d "{...}" localhost:50051 scheduler.JobScheduler/ScheduleJob
done

# Check processing time
time_before=$(date +%s%N)
watch -n 1 'redis-cli ZCARD tasks_queue'
# Note time when queue empties

# Scale to 5 workers
docker-compose up -d --scale worker=5

# Repeat the same 100 jobs
for i in {101..200}; do
  grpcurl -d "{...}" localhost:50051 scheduler.JobScheduler/ScheduleJob
done

# Compare completion times
# With 5 workers, should be ~5x faster
```

### 5. Cassandra Query Performance

**Goal**: Verify minute bucket partitioning

```bash
# Connect to Cassandra
cqlsh localhost

# Check row count in partition
SELECT COUNT(*) FROM scheduler.scheduled_jobs 
WHERE minute_bucket = '2026-03-07-14:00';

# Check query response time
SELECT job_id, scheduled_time FROM scheduler.scheduled_jobs
WHERE minute_bucket = '2026-03-07-14:00'
AND scheduled_time >= 1741351200000
AND scheduled_time <= 1741351230000
LIMIT 100;

# View partition distribution
SELECT token(minute_bucket), minute_bucket, COUNT(*) 
FROM scheduler.scheduled_jobs 
GROUP BY minute_bucket;
```

### 6. Redis Memory Usage

**Goal**: Monitor Redis memory under different load

```bash
# Check memory stats
redis-cli INFO memory

# Sample output:
# used_memory_human: 2.45M
# used_memory_peak_human: 3.12M

# Clear and monitor growth
redis-cli FLUSHALL
redis-cli INFO memory  # Check baseline

# Submit jobs and monitor
watch -n 5 'redis-cli INFO memory | grep used_memory'
```

### 7. Job Deduplication Test

**Goal**: Verify no duplicate execution

```python
import grpc
import redis
from scheduler_pb2 import ScheduleJobRequest
from scheduler_pb2_grpc import JobSchedulerStub

grpc_stub = JobSchedulerStub(grpc.insecure_channel('localhost:50051'))
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Same payload, scheduled for same time
same_payload = '{"type": "important_charge", "amount": 99.99}'
future_time_ms = int((time.time() + 10) * 1000)

# Submit twice (could happen with client retries)
job_id_1 = grpc_stub.ScheduleJob(ScheduleJobRequest(
    payload=same_payload,
    execute_at_ms=future_time_ms
)).job_id

job_id_2 = grpc_stub.ScheduleJob(ScheduleJobRequest(
    payload=same_payload,
    execute_at_ms=future_time_ms
)).job_id

print(f"Job 1: {job_id_1}")
print(f"Job 2: {job_id_2}")

# These are different job IDs (good - no de-duplication at submission)
# But should have different execution records

# Wait for execution, then check Cassandra
# SELECT COUNT(*) FROM job_executions 
# WHERE job_id IN (...) -> should see 2 entries (2 executions)
```

### 8. Retry Logic Test (Future)

**Goal**: Test task retries on failure

```
When implemented:

# Submit job that will fail
request = ScheduleJobRequest(
    payload='{"type": "fail_once", "retry": true}',
    execute_at_ms=future_time_ms
)

# Worker 1 tries, fails
# Task re-inserted with: scheduled_time = now + exponential_backoff
# Worker 2 tries, succeeds

# Verify in Cassandra:
# SELECT * FROM job_executions WHERE job_id = ?
# Should show: 2 attempts, final status = COMPLETED
```

## Monitoring Checklist During Tests

```
□ Cassandra CPU/Memory: < 80%
□ Redis Memory: within limits
□ Watcher polling frequency: Every 5 seconds
□ Worker processing rate: Check logs
□ Queue depth: Stable or decreasing
□ Error rate: 0% (for synthetic tests)
□ Cassandra query time: < 100ms
□ Redis operation time: < 10ms
```

## Common Issues During Testing

### Issue: No tasks appearing in Redis
**Diagnosis**:
```bash
# Check Watcher is running
docker-compose ps | grep watcher

# Check Cassandra has jobs
cqlsh localhost
SELECT COUNT(*) FROM scheduler.scheduled_jobs;

# Check Watcher logs
docker-compose logs watcher | tail -20

# Check Redis connection
redis-cli PING
```

### Issue: Tasks not being executed
**Diagnosis**:
```bash
# Check Worker is running
docker-compose ps | grep worker

# Check Redis has tasks
redis-cli ZCARD tasks_queue

# Check Worker logs
docker-compose logs worker | tail -20

# Check task format in Redis
redis-cli ZRANGE tasks_queue 0 -1
```

### Issue: High latency from submission to execution
**Diagnosis**:
```bash
# Check system load
docker stats

# Increase polling frequency
# Edit docker-compose.yaml: POLL_INTERVAL_SECONDS=2

# Scale workers
docker-compose up --scale worker=10

# Check Cassandra query time
# Monitor in Watcher logs
```

### Issue: Memory usage growing unbounded
**Diagnosis**:
```bash
# Check Redis memory
redis-cli INFO memory

# Check if tasks being removed
redis-cli ZCARD tasks_queue  # Should decrease

# Check for hanging transactions in Cassandra
# Monitor nodetool status

# Check Worker logs for crashes
docker-compose logs worker | grep ERROR
```

## Test Data Generation

```python
import json
import random
import time

def generate_random_payload():
    """Generate realistic task payloads"""
    types = ['email', 'webhook', 'report', 'batch']
    task_type = random.choice(types)
    
    payloads = {
        'email': {
            'type': 'email',
            'to': f'user{random.randint(1,1000)}@example.com',
            'subject': f'Notification {random.randint(1,100)}',
        },
        'webhook': {
            'type': 'webhook',
            'url': f'https://api{random.randint(1,5)}.example.com/hook',
            'method': 'POST',
        },
        'report': {
            'type': 'report',
            'report_type': random.choice(['sales', 'inventory', 'users']),
            'format': random.choice(['pdf', 'excel', 'json']),
        },
        'batch': {
            'type': 'batch',
            'size': random.randint(10, 1000),
            'operation': random.choice(['import', 'export', 'transform']),
        }
    }
    
    return json.dumps(payloads[task_type])

# Generate 100 test jobs
for i in range(100):
    payload = generate_random_payload()
    future_ms = int((time.time() + random.randint(1, 300)) * 1000)
    # Submit via grpc...
    print(f"Job {i}: {payload[:50]}... scheduled for +{future_ms - int(time.time()*1000)}ms")
```
