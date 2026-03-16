# OAuth2 Proxy

一个轻量的 serverless OAuth2 代理，适合浏览器和公开客户端接入。

支持：

- Gmail
- Outlook
- iCloud Mail

英文说明见 [README.md](/home/iscccc/Code/oath2-proxy/README.md)。

## 功能

这个项目提供一组最小 API，用来：

- 获取可用 provider 列表
- 生成授权链接
- 用授权码换取 token
- 刷新 access token

项目面向公开客户端，默认依赖 PKCE 和签名 `state` 提供安全保护。

## 接口

### `GET /api/providers`

返回已配置且已启用的 provider。

响应示例：

```json
{
  "providers": ["gmail", "outlook"]
}
```

### `GET /api/auth-url`

查询参数：

- `provider`
- `codeChallenge`
- `codeChallengeMethod=S256`
- 可选 `state`

响应示例：

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

## 环境变量

必填：

```bash
STATE_SECRET=replace_with_a_long_random_secret
```

Provider 配置：

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
TRUST_PROXY_HEADERS=true
```

说明：

- `STATE_SECRET` 长度至少 32 个字符。
- 如果不设置 `ENABLED_PROVIDERS`，默认启用所有已完整配置的 provider。
- iCloud 的回调地址必须是 HTTPS，且不能是 `localhost`。

## 本地开发

```bash
npm install
npm test
```

本地启动：

```bash
npm run dev
```

## 安全说明

- 强制使用 PKCE
- OAuth `state` 会签名并设置短期有效期
- 可通过 `ALLOWED_ORIGINS` 限制浏览器来源
- 限流为进程内 best-effort 实现
- token 响应默认带 `Cache-Control: no-store`

## 部署

项目默认面向 Vercel 这类 serverless 平台，也可以很容易改造成其他 Node.js serverless 环境。
