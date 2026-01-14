# Use build argument to allow alternative registries (for Dokploy/cloud environments)
# Default to Docker Hub, but can be overridden: docker build --build-arg REGISTRY=ghcr.io
ARG REGISTRY=docker.io
ARG NODE_VERSION=20-alpine

# Stage 1: Dependencies
FROM ${REGISTRY}/library/node:${NODE_VERSION} AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM ${REGISTRY}/library/node:${NODE_VERSION} AS builder
WORKDIR /app

# Accept build arguments for Next.js public environment variables
# These are required at build time for Next.js to embed them in the bundle
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAIN_SITE_URL
ARG SUPABASE_SERVICE_ROLE_KEY
ARG ALLOW_INSECURE_TLS

# Set environment variables for build
# Next.js requires NEXT_PUBLIC_* variables to be available at build time
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_MAIN_SITE_URL=${NEXT_PUBLIC_MAIN_SITE_URL}
ENV SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV ALLOW_INSECURE_TLS=${ALLOW_INSECURE_TLS}

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Stage 3: Runner
FROM ${REGISTRY}/library/node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
# Next.js standalone output includes server.js and necessary files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]
