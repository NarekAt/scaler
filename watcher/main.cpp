#include <iostream>
#include <string>
#include <chrono>
#include <thread>
#include <vector>
#include <cassandra.h>
#include <hiredis/hiredis.h>
#include <grpcpp/grpcpp.h>

// Include the generated proto headers
#include "watcher.pb.h"

using namespace std;

// ============================================================================
// CASSANDRA HELPERS
// ============================================================================

class CassandraClient {
private:
    CassCluster* cluster;
    CassSession* session;

public:
    CassandraClient(const string& contact_points) {
        cluster = cass_cluster_new();
        session = cass_session_new();

        // Set contact points (e.g., "127.0.0.1")
        cass_cluster_set_contact_points(cluster, contact_points.c_str());
        cass_cluster_set_num_threads_io(cluster, 2);

        // Connect to the cluster
        CassFuture* connect_future = cass_session_connect(session, cluster);
        CassError rc = cass_future_error_code(connect_future);

        if (rc == CASS_OK) {
            cout << "Connected to Cassandra" << endl;
        } else {
            cerr << "Failed to connect to Cassandra: " << cass_error_desc(rc) << endl;
        }
        cass_future_free(connect_future);
    }

    ~CassandraClient() {
        CassFuture* close_future = cass_session_close(session);
        cass_future_wait(close_future);
        cass_future_free(close_future);
        cass_session_free(session);
        cass_cluster_free(cluster);
    }

    CassSession* get_session() const {
        return session;
    }

    // Query Cassandra for jobs that need to be executed soon
    // Returns jobs scheduled within the next 'lookahead_seconds'
    vector<tuple<string, string, int64_t>> fetch_pending_jobs(
        const string& minute_bucket,
        int64_t current_time_ms,
        int64_t lookahead_ms,
        int batch_size) {
        
        vector<tuple<string, string, int64_t>> results;

        string query = "SELECT job_id, payload, scheduled_time FROM scheduler.scheduled_jobs "
                      "WHERE minute_bucket = ? AND scheduled_time >= ? AND scheduled_time <= ? "
                      "LIMIT ?;";

        CassStatement* statement = cass_statement_new(query.c_str(), 4);

        // Bind parameters
        // TODO: Implement proper UUID binding
        cass_statement_bind_string(statement, 0, minute_bucket.c_str());
        cass_statement_bind_int64(statement, 1, current_time_ms);
        cass_statement_bind_int64(statement, 2, current_time_ms + lookahead_ms);
        cass_statement_bind_int32(statement, 3, batch_size);

        CassFuture* query_future = cass_session_execute(session, statement);
        CassError rc = cass_future_error_code(query_future);

        if (rc == CASS_OK) {
            const CassResult* result = cass_future_get_result(query_future);
            CassIterator* iterator = cass_iterator_from_result(result);

            while (cass_iterator_next(iterator)) {
                const CassRow* row = cass_iterator_get_row(iterator);
                
                // Extract job_id (UUID)
                const CassValue* job_id_val = cass_row_get_column_by_name(row, "job_id");
                char job_id_str[37];
                CassUuid job_id;
                cass_value_get_uuid(job_id_val, &job_id);
                cass_uuid_string(job_id, job_id_str);

                // Extract payload (text)
                const CassValue* payload_val = cass_row_get_column_by_name(row, "payload");
                const char* payload;
                size_t payload_len;
                cass_value_get_string(payload_val, &payload, &payload_len);
                string payload_str(payload, payload_len);

                // Extract scheduled_time (timestamp)
                const CassValue* scheduled_time_val = cass_row_get_column_by_name(row, "scheduled_time");
                int64_t scheduled_time;
                cass_value_get_int64(scheduled_time_val, &scheduled_time);

                results.push_back(make_tuple(job_id_str, payload_str, scheduled_time));
            }

            cass_iterator_free(iterator);
        } else {
            cerr << "Query failed: " << cass_error_desc(rc) << endl;
        }

        cass_statement_free(statement);
        cass_future_free(query_future);

        return results;
    }
};

// ============================================================================
// REDIS HELPERS
// ============================================================================

class RedisClient {
private:
    redisContext* context;

public:
    RedisClient(const string& host, int port) {
        context = redisConnect(host.c_str(), port);
        if (context == nullptr || context->err) {
            if (context) {
                cerr << "Redis connection error: " << context->errstr << endl;
                redisFree(context);
            } else {
                cerr << "Redis: Failed to allocate redis context" << endl;
            }
            context = nullptr;
        } else {
            cout << "Connected to Redis" << endl;
        }
    }

    ~RedisClient() {
        if (context != nullptr) {
            redisFree(context);
        }
    }

    bool is_connected() const {
        return context != nullptr;
    }

    // Publish a task to a Redis sorted set
    // The score is the scheduled_time (for ordering)
    bool publish_task(const string& job_id, const string& payload, int64_t scheduled_time) {
        if (!is_connected()) {
            cerr << "Redis not connected" << endl;
            return false;
        }

        // Use ZADD to add to sorted set: ZADD tasks_queue <score> <member>
        // Member: JSON with job_id and payload
        string member = "{\"job_id\":\"" + job_id + "\",\"payload\":" + payload + "}";
        double score = static_cast<double>(scheduled_time);

        redisReply* reply = (redisReply*)redisCommand(
            context,
            "ZADD tasks_queue %f %s",
            score,
            member.c_str()
        );

        if (reply == nullptr) {
            cerr << "Redis command failed: " << context->errstr << endl;
            return false;
        }

        bool success = (reply->type == REDIS_REPLY_INTEGER);
        freeReplyObject(reply);
        return success;
    }

    // Get pending tasks from Redis (those with scheduled_time <= current_time)
    vector<string> get_pending_tasks(int64_t current_time_ms) {
        vector<string> tasks;

        if (!is_connected()) {
            cerr << "Redis not connected" << endl;
            return tasks;
        }

        // ZRANGEBYSCORE tasks_queue 0 <current_time>
        redisReply* reply = (redisReply*)redisCommand(
            context,
            "ZRANGEBYSCORE tasks_queue 0 %lld",
            (long long)current_time_ms
        );

        if (reply == nullptr) {
            cerr << "Redis command failed: " << context->errstr << endl;
            return tasks;
        }

        if (reply->type == REDIS_REPLY_ARRAY) {
            for (size_t i = 0; i < reply->elements; ++i) {
                tasks.push_back(string(reply->element[i]->str, reply->element[i]->len));
            }
        }

        freeReplyObject(reply);
        return tasks;
    }
};

// ============================================================================
// WATCHER SERVICE
// ============================================================================

class WatcherService {
private:
    CassandraClient* cassandra;
    RedisClient* redis;
    int poll_interval_seconds;
    int lookahead_seconds;
    int batch_size;
    bool running;

public:
    WatcherService(
        const string& cassandra_host,
        const string& redis_host,
        int redis_port,
        int poll_interval,
        int lookahead,
        int batch)
        : poll_interval_seconds(poll_interval),
          lookahead_seconds(lookahead),
          batch_size(batch),
          running(false) {
        
        cassandra = new CassandraClient(cassandra_host);
        redis = new RedisClient(redis_host, redis_port);
    }

    ~WatcherService() {
        running = false;
        delete cassandra;
        delete redis;
    }

    void start() {
        running = true;
        cout << "Watcher service started" << endl;

        while (running) {
            poll_and_publish();
            this_thread::sleep_for(chrono::seconds(poll_interval_seconds));
        }
    }

    void stop() {
        running = false;
        cout << "Watcher service stopped" << endl;
    }

private:
    void poll_and_publish() {
        try {
            auto now = chrono::system_clock::now();
            int64_t current_time_ms = chrono::duration_cast<chrono::milliseconds>(
                now.time_since_epoch()
            ).count();

            // Get the current minute bucket (YYYY-MM-DD-HH:MM)
            time_t tt = chrono::system_clock::to_time_t(now);
            tm local_tm = *localtime(&tt);
            char buffer[20];
            strftime(buffer, sizeof(buffer), "%Y-%m-%d-%H:%M", &local_tm);
            string minute_bucket(buffer);

            // TODO: Also check adjacent minute buckets for tasks at boundaries
            
            int64_t lookahead_ms = lookahead_seconds * 1000LL;

            // Fetch pending jobs from Cassandra
            auto jobs = cassandra->fetch_pending_jobs(
                minute_bucket,
                current_time_ms,
                lookahead_ms,
                batch_size
            );

            cout << "Fetched " << jobs.size() << " jobs from Cassandra" << endl;

            // Publish each job to Redis
            for (const auto& job : jobs) {
                const string& job_id = get<0>(job);
                const string& payload = get<1>(job);
                int64_t scheduled_time = get<2>(job);

                bool published = redis->publish_task(job_id, payload, scheduled_time);
                if (published) {
                    cout << "Published job: " << job_id << " to Redis" << endl;
                } else {
                    cerr << "Failed to publish job: " << job_id << endl;
                }
            }

        } catch (const exception& e) {
            cerr << "Error in poll_and_publish: " << e.what() << endl;
        }
    }
};

// ============================================================================
// MAIN
// ============================================================================

int main() {
    cout << "Starting Distributed Scheduler Watcher Service" << endl;

    // Configuration
    string cassandra_host = "cassandra";  // Docker service name
    string redis_host = "redis";          // Docker service name
    int redis_port = 6379;
    int poll_interval = 5;                // Poll every 5 seconds
    int lookahead = 30;                   // Look ahead 30 seconds
    int batch_size = 100;                 // Fetch up to 100 jobs per poll

    // Create and start the watcher
    WatcherService watcher(
        cassandra_host,
        redis_host,
        redis_port,
        poll_interval,
        lookahead,
        batch_size
    );

    // Run the watcher in the main thread
    // TODO: Add signal handlers for graceful shutdown
    watcher.start();

    return 0;
}
