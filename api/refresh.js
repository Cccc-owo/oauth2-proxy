import { getProviderConfig } from './_lib/providers.js'
import { normalizeTokenPayload, postOAuthForm, UpstreamOAuthError } from './_lib/oauth.js'
import { rateLimit, getClientIp } from './_lib/rateLimit.js'
import { applyRequestPolicy, handleOptions, sendError, sendSuccess, validateFields } from './_lib/response.js'

export default async function handler(req, res) {
  // Handle OPTIONS
  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return
  if (handleOptions(req, res)) return

  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return

  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed')
  }

  // Rate limiting: 10 requests per minute per IP (refresh is more frequent)
  const clientIp = getClientIp(req)
  const limit = rateLimit(`refresh-${clientIp}`, 10, 60000)

  if (!limit.allowed) {
    res.setHeader('Retry-After', Math.ceil((limit.resetTime - Date.now()) / 1000))
    return sendError(res, 429, 'Too many requests')
  }

  // Validate required fields
  const validationError = validateFields(req.body, ['provider', 'refreshToken'])
  if (validationError) {
    return sendError(res, 400, validationError)
  }

  const { provider, refreshToken } = req.body

  // Validate refresh token format
  if (typeof refreshToken !== 'string' || refreshToken.length < 10 || refreshToken.length > 2048) {
    return sendError(res, 400, 'Invalid refresh token format')
  }

  if (/[\u0000-\u001F\u007F\s]/.test(refreshToken)) {
    return sendError(res, 400, 'Invalid refresh token characters')
  }

  try {
    const config = getProviderConfig(provider)
    const tokens = normalizeTokenPayload(await postOAuthForm(config.tokenUrl, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }))

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    sendSuccess(res, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken, // Some providers don't return new refresh token
      expiresAt,
    }, { noStore: true })
  } catch (error) {
    console.error('Token refresh error:', error)
    if (error instanceof UpstreamOAuthError) {
      return sendError(res, error.statusCode, error.message)
    }
    sendError(res, 500, error.message || 'Failed to refresh token')
  }
}
