# OAuth2 Proxy

[English](README.md) | 中文

一个面向浏览器和公开客户端的轻量 serverless OAuth2 代理。

支持：

- Gmail
- Outlook
- iCloud Mail

## 文档入口

接口文档已经内置到项目中：

- `/docs` Swagger UI
- `/api/openapi` OpenAPI JSON

## 本地开发

```bash
npm install
npm test
npm run dev
```

本地访问：

- `http://localhost:3000/docs`
- `http://localhost:3000/api/openapi`

## Vercel 部署

项目按 Vercel Serverless 方式设计。

```bash
vercel
vercel --prod
```

部署后访问同样的三个路径即可。

## 必要配置

```bash
STATE_SECRET=replace_with_a_long_random_secret
```

Provider 配置示例：

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

可选：

```bash
ALLOWED_ORIGINS=https://yourdomain.com
ENABLED_PROVIDERS=gmail,outlook
ACCESS_TOKEN_AUTH_ENABLED=true
ACCESS_TOKEN_AUTH_TOKENS=replace_with_a_long_random_secret,replace_with_next_secret
TRUST_PROXY_HEADERS=true
```

## 说明

- `STATE_SECRET` 长度至少 32 个字符。
- 不设置 `ENABLED_PROVIDERS` 时，默认启用所有已完整配置的 provider。
- 如果 `ACCESS_TOKEN_AUTH_ENABLED=true`，则 `/api/token` 和 `/api/refresh` 必须携带 `Authorization: Bearer <token>`。
- `ACCESS_TOKEN_AUTH_TOKENS` 支持配置一个或多个逗号分隔的内部访问密钥，便于轮换。
- iCloud 回调地址必须是 HTTPS，且不能是 `localhost`。
- Token 响应会带 `Cache-Control: no-store`。
