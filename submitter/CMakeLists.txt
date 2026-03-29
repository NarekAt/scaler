cmake_minimum_required(VERSION 3.10)
project(SchedulerSubmitter)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# If we are on a Mac, tell CMake where Homebrew is
if(APPLE)
    list(APPEND CMAKE_PREFIX_PATH "/opt/homebrew")
endif()

find_package(Threads REQUIRED)
find_package(PkgConfig REQUIRED)

# Try to find Protobuf and gRPC
pkg_check_modules(GRPC REQUIRED grpc++)
pkg_check_modules(PROTOBUF REQUIRED protobuf)

# Generate gRPC headers
# We need to find the grpc_cpp_plugin path
find_program(GRPC_CPP_PLUGIN grpc_cpp_plugin)

set(PROTO_SRC ${CMAKE_CURRENT_BINARY_DIR}/scheduler.pb.cc)
set(PROTO_HDR ${CMAKE_CURRENT_BINARY_DIR}/scheduler.pb.h)
set(GRPC_SRC ${CMAKE_CURRENT_BINARY_DIR}/scheduler.grpc.pb.cc)
set(GRPC_HDR ${CMAKE_CURRENT_BINARY_DIR}/scheduler.grpc.pb.h)

add_custom_command(
    OUTPUT ${PROTO_SRC} ${PROTO_HDR} ${GRPC_SRC} ${GRPC_HDR}
    COMMAND protoc -I${CMAKE_CURRENT_SOURCE_DIR}/proto
    --cpp_out=${CMAKE_CURRENT_BINARY_DIR}
    --grpc_out=${CMAKE_CURRENT_BINARY_DIR}
    --plugin=protoc-gen-grpc=${GRPC_CPP_PLUGIN}
    ${CMAKE_CURRENT_SOURCE_DIR}/proto/scheduler.proto
    DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/proto/scheduler.proto
)

include_directories(${CMAKE_CURRENT_BINARY_DIR} ${GRPC_INCLUDE_DIRS} ${PROTOBUF_INCLUDE_DIRS})

add_executable(app_executable main.cpp ${PROTO_SRC} ${GRPC_SRC})

# Link libraries
# Note: cassandra is usually installed by brew as 'cassandra'
target_link_libraries(app_executable 
    PRIVATE 
    cassandra 
    Threads::Threads
    ${GRPC_LIBRARIES}
    ${PROTOBUF_LIBRARIES}
)