# Docker Deployment Guide

This guide explains how to build and deploy the PPIS Bidding Portal using Docker.

## Prerequisites

- Docker installed (version 20.10 or later)
- Docker Compose installed (optional, for easier deployment)

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Site URLs
NEXT_PUBLIC_SITE_URL=https://bidding-portal.example.com
NEXT_PUBLIC_MAIN_SITE_URL=https://main-site.example.com

# TLS Configuration (optional)
# Set to 'true' only in secure/closed environments
ALLOW_INSECURE_TLS=false
```

## Building the Docker Image

### Using Docker directly:

```bash
docker build -t ppis-bidding-portal .
```

### Using Docker Compose:

```bash
docker-compose build
```

## Running the Container

### Using Docker directly:

```bash
docker run -d \
  --name ppis-bidding-portal \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  ppis-bidding-portal
```

### Using Docker Compose:

```bash
docker-compose up -d
```

The application will be available at `http://localhost:3000`

## Production Deployment

### 1. Build for production:

```bash
docker build -t ppis-bidding-portal:latest .
```

### 2. Tag for your registry (if using a registry):

```bash
docker tag ppis-bidding-portal:latest your-registry/ppis-bidding-portal:latest
```

### 3. Push to registry (if using a registry):

```bash
docker push your-registry/ppis-bidding-portal:latest
```

### 4. Run on production server:

```bash
docker run -d \
  --name ppis-bidding-portal \
  -p 3000:3000 \
  --env-file .env.production \
  --restart unless-stopped \
  ppis-bidding-portal:latest
```

## Docker Compose for Production

Update `docker-compose.yml` with your production environment variables, then:

```bash
docker-compose -f docker-compose.yml up -d
```

## Health Check

The container includes a health check that monitors the application status endpoint:

```bash
# Check container health
docker ps

# View health check logs
docker inspect ppis-bidding-portal | grep -A 10 Health
```

## Troubleshooting

### View logs:

```bash
docker logs ppis-bidding-portal
```

### Follow logs in real-time:

```bash
docker logs -f ppis-bidding-portal
```

### Stop the container:

```bash
docker stop ppis-bidding-portal
```

### Remove the container:

```bash
docker rm ppis-bidding-portal
```

### Rebuild after code changes:

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Multi-Architecture Builds

For ARM64 (Apple Silicon) and AMD64 support:

```bash
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t ppis-bidding-portal:latest --push .
```

## Security Notes

- The container runs as a non-root user (`nextjs`)
- Environment variables should be kept secure
- Use secrets management in production (Docker secrets, Kubernetes secrets, etc.)
- Never commit `.env` files to version control
