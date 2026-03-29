CREATE KEYSPACE IF NOT EXISTS scheduler WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};
USE scheduler;

CREATE TABLE IF NOT EXISTS scheduled_jobs (
    minute_bucket text,
    scheduled_time timestamp,
    job_id uuid,
    payload text,
    PRIMARY KEY ((minute_bucket), scheduled_time, job_id)
) WITH CLUSTERING ORDER BY (scheduled_time ASC);

CREATE TABLE IF NOT EXISTS job_executions (
    job_id uuid PRIMARY KEY,
    status text,
    started_at timestamp,
    completed_at timestamp
);
