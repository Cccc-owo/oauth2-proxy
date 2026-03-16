# OAuth2 Proxy (Serverless)

通用 OAuth2 代理服务，安全处理邮件提供商的 OAuth2 认证。

## 支持的提供商

- ✅ **Gmail** - Google Workspace
- ✅ **Outlook** - Microsoft 365 / Outlook.com
- ✅ **iCloud Mail** - Apple iCloud

## 快速部署

### Vercel（推荐）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. 点击按钮部署
2. 设置环境变量（见下方）
3. 完成

### 手动部署

```bash
npm i -g vercel
vercel login
vercel
```

## 环境变量

### 必需安全配置

```bash
# 用于签名 OAuth state，防止 state 被伪造或篡改
STATE_SECRET=replace_with_a_long_random_state_signing_secret
```

### 提供商控制（可选）

```bash
# 启用特定提供商（逗号分隔）
ENABLED_PROVIDERS=gmail,outlook

# 只启用 Gmail
ENABLED_PROVIDERS=gmail

# 启用所有已配置的提供商（默认）
ENABLED_PROVIDERS=all
```

### Gmail（必需）

```bash
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REDIRECT_URI=https://yourdomain.com/oauth2/callback
```

### Outlook（可选）

```bash
OUTLOOK_CLIENT_ID=your_client_id
OUTLOOK_CLIENT_SECRET=your_client_secret
OUTLOOK_REDIRECT_URI=https://yourdomain.com/oauth2/callback
```

### iCloud Mail（可选）

```bash
ICLOUD_CLIENT_ID=your_service_id
ICLOUD_REDIRECT_URI=https://yourdomain.com/oauth2/callback
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

### 安全配置（可选）

```bash
# 精确匹配允许的浏览器 Origin（逗号分隔）
ALLOWED_ORIGINS=https://yourdomain.com

# 只有在平台会覆盖 x-forwarded-for / x-real-ip 时才开启
TRUST_PROXY_HEADERS=true
```

说明：

- 所有已启用 provider 都必须显式配置对应的 `*_REDIRECT_URI`
- `GET /api/providers` 只会返回完整可用的 provider
- iCloud 的 `redirect_uri` 必须是 HTTPS，且不能是 `localhost`

## 获取 OAuth2 凭证

### Gmail

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建项目 → 启用 Gmail API
3. 创建 OAuth 2.0 客户端 ID（Web 应用）
4. 添加重定向 URI
5. 获取 client_id 和 client_secret

### Outlook

1. 访问 [Azure Portal](https://portal.azure.com/)
2. 注册应用 → API 权限 → 添加 IMAP/SMTP 权限
3. 创建客户端密钥
4. 获取 client_id 和 client_secret

### iCloud Mail

1. 访问 [Apple Developer](https://developer.apple.com/)
2. 创建 App ID → 启用 Sign in with Apple
3. 配置服务 ID 和 HTTPS 重定向 URI
4. 创建 Sign in with Apple 私钥，记录 `TEAM_ID`、`KEY_ID`
5. 将私钥内容放入 `APPLE_PRIVATE_KEY`，服务端会在运行时生成 JWT client secret

## API 端点

### 列出可用提供商

```http
GET /api/providers
```

响应：

```json
{
  "providers": ["gmail", "outlook"]
}
```

### 获取授权 URL

```http
GET /api/auth-url?provider=gmail
```

必须附带 PKCE 参数：

```http
GET /api/auth-url?provider=gmail&codeChallenge=BASE64URL_SHA256&codeChallengeMethod=S256
```

响应：

```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...&state=generated_state",
  "state": "generated_state"
}
```

如果调用方已有自己的前端 `state`，也可以透传，服务端会把它封装进签名后的 OAuth state：

```http
GET /api/auth-url?provider=gmail&codeChallenge=BASE64URL_SHA256&codeChallengeMethod=S256&state=your_csrf_state
```

### 交换授权码

```http
POST /api/token
Content-Type: application/json

{
  "provider": "gmail",
  "code": "authorization_code",
  "state": "signed_state_from_auth_url",
  "codeVerifier": "pkce_code_verifier"
}
```

### 刷新 Token

```http
POST /api/refresh
Content-Type: application/json

{
  "provider": "gmail",
  "refreshToken": "refresh_token"
}
```

## 本地开发

```bash
cp .env.example .env
# 编辑 .env 填入凭证
npm install
npm run dev
```

## 安全特性

- ✅ 速率限制（每 IP）
- ✅ 精确 Origin 白名单
- ✅ 面向公开客户端的无密钥接入
- ✅ 签名 OAuth `state`
- ✅ 强制 PKCE（`S256`）
- ✅ 输入验证和清理
- ✅ 错误消息清理
- ✅ 安全头部
- ✅ CORS 配置
- ✅ 上游 OAuth 请求超时保护
- ✅ 默认不信任客户端伪造的转发 IP 头

说明：当前速率限制为进程内 best-effort，适合基础防刷；如果要在多实例 serverless 环境里做强一致限流，需要接入外部存储。

说明：这个代理面向公开客户端，核心安全依赖 PKCE、签名 `state`、短时有效期、输入校验和限流；`Origin` 白名单只用于浏览器环境的附加约束，不是唯一安全边界。

## 添加新提供商

1. 编辑 `api/_lib/providers.js`
2. 添加配置
3. 完成！

## License

MIT
