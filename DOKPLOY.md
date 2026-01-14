# Dokploy Deployment Guide

This guide helps resolve common issues when deploying to Dokploy.

## Common Issues

- **DNS Resolution Errors**: See solutions below
- **Environment Variable Errors**: See [DOKPLOY-ENV-FIX.md](./DOKPLOY-ENV-FIX.md) for "supabaseUrl is required" errors

## Problem

If you're getting DNS resolution errors like:
```
ERROR: failed to do request: Head "https://registry-1.docker.io/v2/library/node/manifests/20-alpine": dial tcp: lookup registry-1.docker.io on 127.0.0.53:53: read udp 127.0.0.1:33889->127.0.0.53:53: i/o timeout
```

This indicates that Dokploy's build environment cannot reach Docker Hub.

## Solutions

### Solution 1: Configure DNS in Dokploy Server (Recommended)

The DNS issue is at the Docker daemon level, not inside the container. Configure DNS on the Dokploy server:

1. **SSH into your Dokploy server**
2. **Edit Docker daemon configuration:**
   ```bash
   sudo nano /etc/docker/daemon.json
   ```
3. **Add DNS configuration:**
   ```json
   {
     "dns": ["8.8.8.8", "8.8.4.4", "1.1.1.1"]
   }
   ```
4. **Restart Docker:**
   ```bash
   sudo systemctl restart docker
   ```
5. **Test DNS resolution:**
   ```bash
   docker run --rm alpine nslookup registry-1.docker.io
   ```

### Solution 2: Use Alternative Dockerfile

Use the `Dockerfile.dokploy` which has commented alternatives:

1. In Dokploy, go to your application settings
2. Change the Dockerfile path to: `Dockerfile.dokploy`
3. If Docker Hub still fails, edit `Dockerfile.dokploy` and uncomment one of the alternative registry lines
4. Save and redeploy

### Solution 2: Configure DNS in Dokploy

If Dokploy allows custom DNS configuration:

1. Go to Dokploy server settings
2. Configure DNS servers:
   - Primary: `8.8.8.8` (Google DNS)
   - Secondary: `8.8.4.4` (Google DNS)
   - Or use Cloudflare DNS: `1.1.1.1` and `1.0.0.1`

### Solution 3: Use Build Arguments with Alternative Registry

If Dokploy supports build arguments, you can use an alternative registry:

**Option A: Use GitHub Container Registry (ghcr.io)**
```bash
# In Dokploy build settings, add build args:
REGISTRY=ghcr.io
```

**Option B: Use a Docker Hub Mirror**
```bash
# If you have access to a mirror, use:
REGISTRY=your-mirror.com
```

### Solution 4: Pre-pull Base Image

If you have SSH access to the Dokploy server:

1. SSH into the Dokploy server
2. Pre-pull the base image:
```bash
docker pull node:20-alpine
```
3. Then deploy through Dokploy (it will use the cached image)

### Solution 5: Use Docker BuildKit with DNS

If Dokploy supports BuildKit, configure it with custom DNS:

```bash
DOCKER_BUILDKIT=1 docker build \
  --dns 8.8.8.8 \
  --dns 8.8.4.4 \
  -t ppis-bidding-portal .
```

### Solution 6: Network Configuration in Dokploy

Check if Dokploy has network/firewall settings:

1. Ensure outbound HTTPS (443) and HTTP (80) are allowed
2. Ensure DNS (port 53) is allowed
3. Check if there's a proxy that needs configuration

## Recommended Approach for Dokploy

1. **First, try Solution 1** (use Dockerfile.dokploy)
2. **If that doesn't work, try Solution 2** (configure DNS in Dokploy)
3. **As a last resort**, contact Dokploy support or use Solution 4 (pre-pull image)

## Testing DNS Resolution

If you have access to the Dokploy server, test DNS:

```bash
# Test DNS resolution
nslookup registry-1.docker.io

# Test connectivity
curl -I https://registry-1.docker.io/v2/

# Test with specific DNS
nslookup registry-1.docker.io 8.8.8.8
```

## Alternative: Use a Different Base Image

If Docker Hub continues to be unreachable, you can modify the Dockerfile to use:

- **Alpine Linux + Node.js manual install** (more complex)
- **A registry mirror** (if available)
- **A private registry** (if you have one)

## Contact Dokploy Support

If none of these solutions work, contact Dokploy support with:
- The error message
- Your server's network configuration
- Whether you can access Docker Hub from the server directly

They may need to:
- Configure network rules
- Set up a registry mirror
- Allow specific outbound connections
