# Deployment Notes

## Current Preview

```text
https://anime-tier-board-74zcixibh-tnob39s-projects.vercel.app
```

## Required Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables.

```env
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
AUTH_URL
AUTH_TRUST_HOST
```

Recommended values:

```env
AUTH_URL=https://anime-tier-board-74zcixibh-tnob39s-projects.vercel.app
AUTH_TRUST_HOST=true
```

## Google OAuth

Keep the localhost URLs for local development and add the Vercel URLs for preview.

Authorized JavaScript origins:

```text
http://localhost:3000
https://anime-tier-board-74zcixibh-tnob39s-projects.vercel.app
```

Authorized redirect URIs:

```text
http://localhost:3000/api/auth/callback/google
https://anime-tier-board-74zcixibh-tnob39s-projects.vercel.app/api/auth/callback/google
```

## Notes

- Share pages are stored as immutable snapshots in Turso.
- Likes are de-duplicated with a local reaction key plus Turso uniqueness.
- Codex may not be able to deploy directly if outbound Vercel HTTPS is blocked. Run `vercel deploy -y` locally in that case.
