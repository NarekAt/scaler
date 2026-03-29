# Stage 1: Build Environment
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential cmake git libuv1-dev libssl-dev zlib1g-dev \
    protobuf-compiler libprotobuf-dev libgrpc++-dev protobuf-compiler-grpc \
    pkg-config

# Build DataStax C++ Driver from source (Required for Mac ARM64)
WORKDIR /tmp
RUN git clone https://github.com/datastax/cpp-driver.git && \
    cd cpp-driver && \
    mkdir build && cd build && \
    cmake .. -DCASS_BUILD_STATIC=ON -DCASS_BUILD_SHARED=ON && \
    make -j4 && \
    make install

# Compile the application
WORKDIR /app
COPY . .
RUN mkdir build && cd build && cmake .. && make

# Stage 2: Runtime
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    libuv1 libssl3 libprotobuf-dev libgrpc++-dev && rm -rf /var/lib/apt/lists/*

# Copy the entire /usr/local directory from the builder to catch libraries regardless of arm64/amd64 paths
COPY --from=builder /usr/local /usr/local

# Tell the Linux linker exactly where to look for shared libraries
ENV LD_LIBRARY_PATH="/usr/local/lib:/usr/local/lib64:/usr/local/lib/aarch64-linux-gnu:/usr/local/lib/x86_64-linux-gnu"
RUN ldconfig

WORKDIR /app
COPY --from=builder /app/build/app_executable .

CMD ["./app_executable"]