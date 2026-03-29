cmake_minimum_required(VERSION 3.10)
project(SchedulerWatcher)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# If we are on a Mac, tell CMake where Homebrew is
if(APPLE)
    list(APPEND CMAKE_PREFIX_PATH "/opt/homebrew")
endif()

find_package(Threads REQUIRED)
find_package(PkgConfig REQUIRED)

# Find dependencies
pkg_check_modules(GRPC REQUIRED grpc++)
pkg_check_modules(PROTOBUF REQUIRED protobuf)
pkg_check_modules(CASSANDRA REQUIRED cassandra)
pkg_check_modules(HIREDIS REQUIRED hiredis)

# Generate gRPC headers
find_program(GRPC_CPP_PLUGIN grpc_cpp_plugin)

set(PROTO_SRC ${CMAKE_CURRENT_BINARY_DIR}/watcher.pb.cc)
set(PROTO_HDR ${CMAKE_CURRENT_BINARY_DIR}/watcher.pb.h)
set(GRPC_SRC ${CMAKE_CURRENT_BINARY_DIR}/watcher.grpc.pb.cc)
set(GRPC_HDR ${CMAKE_CURRENT_BINARY_DIR}/watcher.grpc.pb.h)

add_custom_command(
    OUTPUT ${PROTO_SRC} ${PROTO_HDR} ${GRPC_SRC} ${GRPC_HDR}
    COMMAND protoc -I${CMAKE_CURRENT_SOURCE_DIR}/proto
    --cpp_out=${CMAKE_CURRENT_BINARY_DIR}
    --grpc_out=${CMAKE_CURRENT_BINARY_DIR}
    --plugin=protoc-gen-grpc=${GRPC_CPP_PLUGIN}
    ${CMAKE_CURRENT_SOURCE_DIR}/proto/watcher.proto
    DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/proto/watcher.proto
)

include_directories(${CMAKE_CURRENT_BINARY_DIR} ${GRPC_INCLUDE_DIRS} ${PROTOBUF_INCLUDE_DIRS} ${REDIS_INCLUDE_DIRS})

add_executable(watcher_executable main.cpp ${PROTO_SRC} ${GRPC_SRC})

# Link libraries
target_link_libraries(watcher_executable
    PRIVATE
    cassandra
    Threads::Threads
    ${GRPC_LIBRARIES}
    ${PROTOBUF_LIBRARIES}
    ${HIREDIS_LIBRARIES}
)
