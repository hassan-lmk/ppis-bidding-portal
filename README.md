# PPIS Bidding Portal

A separate Next.js application for the PPIS Bidding Portal, extracted from the main PPIS Website.

## Features

- **SSO Integration**: Seamless authentication with the main PPIS website
- **Bidding Portal**: Full bidding portal functionality
- **Interactive Map**: View bidding blocks on an interactive map
- **Payment Management**: Track payments and download receipts
- **Support Tickets**: Create and manage support tickets

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env.local
```

3. Update `.env.local` with your Supabase credentials and configuration.

4. Run the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3001` (or the port specified in your environment).

## SSO Configuration

The bidding portal shares authentication with the main PPIS website through Supabase. If a user is logged into the main site, they will automatically be logged into the bidding portal when accessing it.

### How it works:

1. Both apps use the same Supabase instance
2. Sessions are stored in localStorage
3. If no session exists, users are redirected to the login page
4. After login, users can access the bidding portal

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for API routes)
- `NEXT_PUBLIC_SITE_URL`: The URL of this bidding portal app
- `NEXT_PUBLIC_MAIN_SITE_URL`: The URL of the main PPIS website (for SSO redirects)

## Project Structure

```
app/
  api/              # API routes
  bidding-portal/   # Bidding portal pages
  components/       # React components
  lib/              # Utilities and helpers
  login/            # Login page
```

## Development

- The app uses Next.js 15 with the App Router
- TypeScript for type safety
- Tailwind CSS for styling
- Supabase for authentication and database

## Deployment

Build the production version:
```bash
npm run build
npm start
```

For deployment, ensure all environment variables are set in your hosting platform.
