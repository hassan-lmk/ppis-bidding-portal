#!/bin/bash
# Build script for Dokploy with DNS configuration
# This script can be used if Dokploy supports custom build scripts

set -e

echo "🔧 Configuring DNS for Docker build..."

# Configure DNS for Docker build
export DOCKER_BUILDKIT=1

# Build with custom DNS
docker build \
  --dns 8.8.8.8 \
  --dns 8.8.4.4 \
  --dns 1.1.1.1 \
  -t ppis-bidding-portal:latest \
  -f Dockerfile \
  .

echo "✅ Build completed successfully!"
