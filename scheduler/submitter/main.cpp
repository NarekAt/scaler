#include <iostream>
#include <string>
#include <chrono>
#include <thread>
#include <cassandra.h>
#include <grpcpp/grpcpp.h>

// Include the generated gRPC headers
#include "scheduler.grpc.pb.h"

using grpc::Server;
using grpc::ServerBuilder;
using grpc::ServerContext;
using grpc::Status;
using scheduler::JobScheduler;
using scheduler::ScheduleJobRequest;
using scheduler::ScheduleJobResponse;

// Helper to calculate the Cassandra Partition Key ("YYYY-MM-DD-HH:MM")
std::string get_minute_bucket(int64_t timestamp_ms) {
    auto time_point = std::chrono::system_clock::time_point(std::chrono::milliseconds(timestamp_ms));
    time_t tt = std::chrono::system_clock::to_time_t(time_point);
    tm utc_tm = *gmtime(&tt);
    char buffer[20];
    strftime(buffer, sizeof(buffer), "%Y-%m-%d-%H:%M", &utc_tm);
    return std::string(buffer);
}

// The gRPC Service Implementation
class JobSchedulerServiceImpl final : public JobScheduler::Service {
private:
    CassSession* session;

    CassUuid generate_uuid() {
        CassUuidGen* uuid_gen = cass_uuid_gen_new();
        CassUuid uuid;
        cass_uuid_gen_random(uuid_gen, &uuid);
        cass_uuid_gen_free(uuid_gen);
        return uuid;
    }

public:
    JobSchedulerServiceImpl(CassSession* cass_session) : session(cass_session) {}

    // This is triggered every time a client calls the API
    Status ScheduleJob(ServerContext* context, const ScheduleJobRequest* request, ScheduleJobResponse* reply) override {
        
        std::string minute_bucket = get_minute_bucket(request->execute_at_ms());
        CassUuid job_id = generate_uuid();
        char uuid_str[37];
        cass_uuid_string(job_id, uuid_str);

        std::cout << "[gRPC] Received job. Bucket: " << minute_bucket << " | Payload: " << request->payload() << std::endl;

        // Ensure idempotency and state consistency with a Cassandra Batch
        std::string query = "BEGIN BATCH "
                            "INSERT INTO scheduled_jobs (minute_bucket, scheduled_time, job_id, payload) VALUES (?, ?, ?, ?); "
                            "INSERT INTO job_executions (job_id, status) VALUES (?, 'PENDING'); "
                            "APPLY BATCH;";

        CassStatement* statement = cass_statement_new(query.c_str(), 5);
        cass_statement_bind_string(statement, 0, minute_bucket.c_str());
        cass_statement_bind_int64(statement, 1, request->execute_at_ms());
        cass_statement_bind_uuid(statement, 2, job_id);
        cass_statement_bind_string(statement, 3, request->payload().c_str());
        cass_statement_bind_uuid(statement, 4, job_id);

        CassFuture* execute_future = cass_session_execute(session, statement);
        
        if (cass_future_error_code(execute_future) == CASS_OK) {
            reply->set_job_id(uuid_str);
            reply->set_status("PENDING");
            cass_statement_free(statement);
            cass_future_free(execute_future);
            return Status::OK;
        } else {
            const char* message;
            size_t message_length;
            cass_future_error_message(execute_future, &message, &message_length);
            std::string err_msg(message, message_length);
            std::cerr << "[gRPC] Cassandra Error: " << err_msg << std::endl;
            
            cass_statement_free(statement);
            cass_future_free(execute_future);
            return Status(grpc::StatusCode::INTERNAL, err_msg);
        }
    }
};

void RunServer(CassSession* session) {
    std::string server_address("0.0.0.0:50051");
    JobSchedulerServiceImpl service(session);

    ServerBuilder builder;
    builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
    builder.RegisterService(&service);
    
    std::unique_ptr<Server> server(builder.BuildAndStart());
    std::cout << "[Submitter] gRPC Server listening on " << server_address << std::endl;
    server->Wait();
}

int main() {
    std::cout << "[Submitter] Booting up... waiting for Cassandra..." << std::endl;
    std::this_thread::sleep_for(std::chrono::seconds(15));

    CassCluster* cluster = cass_cluster_new();
    CassSession* session = cass_session_new();
    cass_cluster_set_contact_points(cluster, "cassandra");
    
    CassFuture* connect_future = cass_session_connect_keyspace(session, cluster, "scheduler");
    if (cass_future_error_code(connect_future) != CASS_OK) {
        std::cerr << "[Submitter] Failed to connect to Cassandra!" << std::endl;
        return 1;
    }
    
    std::cout << "[Submitter] Connected to Cassandra DB." << std::endl;

    // Start the gRPC server blocking loop
    RunServer(session);

    // Cleanup
    cass_future_free(connect_future);
    cass_cluster_free(cluster);
    cass_session_free(session);

    return 0;
}
