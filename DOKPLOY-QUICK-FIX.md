# Quick Fix for Dokploy DNS Error

## Immediate Solution

If you're getting the DNS timeout error in Dokploy, try these in order:

### Option 1: Configure Docker DNS (Best Solution)

SSH into your Dokploy server and run:

```bash
# Create/edit Docker daemon config
sudo nano /etc/docker/daemon.json
```

Add this content:
```json
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
```

Then restart Docker:
```bash
sudo systemctl restart docker
```

### Option 2: Pre-pull the Base Image

SSH into Dokploy server and run:
```bash
docker pull node:20-alpine
```

Then deploy through Dokploy - it will use the cached image.

### Option 3: Use Alternative Registry

Edit `Dockerfile.dokploy` and uncomment one of these lines at the top:

```dockerfile
# Instead of: FROM node:20-alpine AS deps
# Use one of these:
FROM mcr.microsoft.com/oss/node/node:20-alpine AS deps
# OR
FROM registry.cn-hangzhou.aliyuncs.com/acs/node:20-alpine AS deps
```

Then in Dokploy, set Dockerfile to: `Dockerfile.dokploy`

### Option 4: Contact Dokploy Support

If none work, contact Dokploy support - they may need to:
- Configure network firewall rules
- Set up a Docker registry mirror
- Fix DNS server configuration

## Test DNS Resolution

After fixing, test with:
```bash
docker run --rm alpine nslookup registry-1.docker.io
```

If this works, your build should work too.
