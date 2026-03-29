#!/bin/bash
set -e

GRPC_PLUGIN=$(which grpc_cpp_plugin)

protoc -I submitter/proto \
    --cpp_out=submitter \
    --grpc_out=submitter \
    --plugin=protoc-gen-grpc="$GRPC_PLUGIN" \
    submitter/proto/scheduler.proto

protoc -I watcher/proto \
    --cpp_out=watcher \
    --grpc_out=watcher \
    --plugin=protoc-gen-grpc="$GRPC_PLUGIN" \
    watcher/proto/watcher.proto

echo "Proto files regenerated."
