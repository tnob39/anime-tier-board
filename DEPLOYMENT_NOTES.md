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
WRITE_RATE_LIMIT_SECRET
AUTH_URL
AUTH_TRUST_HOST
CRON_SECRET
BLOB_READ_WRITE_TOKEN
GITHUB_FEEDBACK_TOKEN
GITHUB_FEEDBACK_REPO
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
- `WRITE_RATE_LIMIT_SECRET` is required in every production deployment. Use an independently generated value of at least 32 characters with no whitespace or control characters; do not reuse `AUTH_SECRET`.
- Keep `WRITE_RATE_LIMIT_SECRET` stable across deployments. The Turso-backed limiter is durable across Vercel isolates. Rotating it creates a new HMAC-derived namespace, so active buckets under the old secret cannot consume the new namespace quota; expired old rows are removed by bounded cleanup.
- Missing, invalid, or unavailable limiter configuration returns a generic 503 and fails closed. Never place the secret value in this document, logs, or client-visible responses.
- Codex may not be able to deploy directly if outbound Vercel HTTPS is blocked. Run `vercel deploy -y` locally in that case.
