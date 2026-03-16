# OAuth2 Proxy

English | [中文](README_zh-CN.md)

A small serverless OAuth2 proxy for browser and public-client flows.

Supports:

- Gmail
- Outlook
- iCloud Mail

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

For Chinese documentation, see [README_zh-CN.md](/home/iscccc/Code/oath2-proxy/README_zh-CN.md).

## What It Does

This project provides a minimal API to:

- list available providers
- generate an authorization URL
- exchange an authorization code for tokens
- refresh access tokens

It is designed for public clients and uses PKCE and signed `state`.

## Endpoints

### `GET /api/providers`

Returns configured and enabled providers.

Response:

```json
{
  "providers": ["gmail", "outlook"]
}
```

### `GET /api/auth-url`

Query parameters:

- `provider`
- `codeChallenge`
- `codeChallengeMethod=S256`
- optional `state`

Response:

```json
{
  "authUrl": "https://provider.example/authorize?...",
  "state": "signed_state"
}
```

### `POST /api/token`

```json
{
  "provider": "gmail",
  "code": "authorization_code",
  "state": "signed_state",
  "codeVerifier": "pkce_code_verifier"
}
```

### `POST /api/refresh`

```json
{
  "provider": "gmail",
  "refreshToken": "refresh_token"
}
```

## Environment Variables

Required:

```bash
STATE_SECRET=replace_with_a_long_random_secret
```

Provider config:

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
TRUST_PROXY_HEADERS=true
```

Notes:

- `STATE_SECRET` must be at least 32 characters.
- If `ENABLED_PROVIDERS` is unset, all fully configured providers are available.
- iCloud requires an HTTPS redirect URI and does not allow `localhost`.

## Local Development

```bash
npm install
npm test
```

To run locally:

```bash
npm run dev
```

## Security Notes

- PKCE is required
- OAuth `state` is signed and short-lived
- browser origins can be restricted with `ALLOWED_ORIGINS`
- rate limiting is in-memory and best-effort
- token responses are sent with `Cache-Control: no-store`

## Deploy

This project is intended for Vercel-style serverless deployment, but the API handlers can also be adapted to other Node.js serverless platforms.
