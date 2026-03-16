# OAuth2 Proxy

English | [中文](README_zh-CN.md)

Minimal serverless OAuth2 proxy for browser and public-client flows.

Supports:

- Gmail
- Outlook
- iCloud Mail

## Docs

The API reference is built into the app:

- `/docs` Swagger UI
- `/api/openapi` OpenAPI JSON

## Local Development

```bash
npm install
npm test
npm run dev
```

Open:

- `http://localhost:3000/docs`
- `http://localhost:3000/api/openapi`

## Vercel Deployment

This project is designed for Vercel serverless deployment.

```bash
vercel
vercel --prod
```

After deployment, use the same three paths on your deployment domain.

## Required Config

```bash
STATE_SECRET=replace_with_a_long_random_secret
```

Provider examples:

```bash
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REDIRECT_URI=https://yourdomain.com/oauth2/callback

OUTLOOK_CLIENT_ID=your_client_id
OUTLOOK_CLIENT_SECRET=your_client_secret
OUTLOOK_REDIRECT_URI=https://yourdomain.com/oauth2/callback

ICLOUD_CLIENT_ID=your_service_id
ICLOUD_REDIRECT_URI=https://yourdomain.com/oauth2/callback
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Optional:

```bash
ALLOWED_ORIGINS=https://yourdomain.com
ENABLED_PROVIDERS=gmail,outlook
ACCESS_TOKEN_AUTH_ENABLED=true
ACCESS_TOKEN_AUTH_TOKENS=replace_with_a_long_random_secret,replace_with_next_secret
TRUST_PROXY_HEADERS=true
```

## Notes

- `STATE_SECRET` must be at least 32 characters.
- If `ENABLED_PROVIDERS` is unset, all fully configured providers are enabled.
- If `ACCESS_TOKEN_AUTH_ENABLED=true`, `/api/token` and `/api/refresh` require `Authorization: Bearer <token>`.
- `ACCESS_TOKEN_AUTH_TOKENS` accepts one or more comma-separated internal access tokens for rotation.
- iCloud requires an HTTPS redirect URI and does not allow `localhost`.
- Token responses are sent with `Cache-Control: no-store`.
