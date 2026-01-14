# Fix: "supabaseUrl is required" Error in Dokploy

## Problem

You're getting this error during Docker build:
```
Error: supabaseUrl is required
```

Even though you've set `NEXT_PUBLIC_SUPABASE_URL` in Dokploy's environment variables.

## Root Cause

Next.js requires `NEXT_PUBLIC_*` environment variables to be available **at build time**, not just runtime. These variables are embedded into the JavaScript bundle during the build process.

In Docker, environment variables set in the container runtime are NOT available during the build stage. You need to pass them as **build arguments**.

## Solution for Dokploy

### Step 1: Set Build Arguments in Dokploy

In your Dokploy application settings, you need to configure **Build Arguments** (not just Environment Variables):

1. Go to your application in Dokploy
2. Navigate to **Settings** or **Build Configuration**
3. Look for **Build Arguments** or **Build-time Variables**
4. Add these build arguments:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=https://bidding-portal.example.com
NEXT_PUBLIC_MAIN_SITE_URL=https://main-site.example.com
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ALLOW_INSECURE_TLS=false
```

### Step 2: Also Set Runtime Environment Variables

Even though you set build arguments, you also need runtime environment variables (for the running container):

In Dokploy's **Environment Variables** section, add the same variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=https://bidding-portal.example.com
NEXT_PUBLIC_MAIN_SITE_URL=https://main-site.example.com
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ALLOW_INSECURE_TLS=false
```

### Step 3: Rebuild and Deploy

After setting both build arguments and environment variables:
1. Save the configuration
2. Trigger a new build/deployment
3. The build should now succeed

## Dokploy UI Location

The exact location depends on Dokploy's UI, but look for:
- **Build Settings** or **Build Configuration**
- **Build Arguments** or **Build-time Variables**
- **Docker Build Args**

If you can't find build arguments in the UI, you may need to:
1. Use Dokploy's CLI/API
2. Or modify the Dockerfile to read from a file
3. Or contact Dokploy support

## Alternative: Using .env File in Build

If Dokploy doesn't support build arguments, you can create a `.env.production` file in your repository (but be careful with secrets):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=https://bidding-portal.example.com
NEXT_PUBLIC_MAIN_SITE_URL=https://main-site.example.com
```

**⚠️ WARNING**: Only do this if your repository is private and you understand the security implications. Never commit secrets to public repositories.

## Verification

After deployment, verify the environment variables are set:

1. Check the build logs - you should see the variables being used
2. Check the running container:
   ```bash
   docker exec <container-name> env | grep NEXT_PUBLIC
   ```
3. Check the application - it should connect to Supabase correctly

## Common Mistakes

1. ❌ **Only setting runtime environment variables** - These won't be available during build
2. ❌ **Setting variables after build** - Too late, Next.js already bundled the code
3. ❌ **Using wrong variable names** - Must be exactly `NEXT_PUBLIC_SUPABASE_URL` (case-sensitive)
4. ❌ **Empty strings** - Make sure variables aren't empty or just whitespace

## Still Having Issues?

1. Check Dokploy's documentation for build arguments
2. Verify the variable names match exactly (case-sensitive)
3. Check build logs for any error messages
4. Ensure variables don't have trailing spaces or quotes
5. Contact Dokploy support if build arguments aren't available in the UI
