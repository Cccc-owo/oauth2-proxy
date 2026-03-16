import { getProviderConfig } from './_lib/providers.js'
import { normalizeTokenPayload, postOAuthForm, UpstreamOAuthError } from './_lib/oauth.js'
import { rateLimit, getClientIp } from './_lib/rateLimit.js'
import { applyRequestPolicy, handleOptions, sendError, sendSuccess, validateFields } from './_lib/response.js'
import { requireAccessTokenAuth } from './_lib/accessTokenAuth.js'
import { verifyPkceCodeVerifier, verifySignedState } from './_lib/security.js'

export default async function handler(req, res) {
  // Handle OPTIONS
  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return
  if (handleOptions(req, res)) return

  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return

  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed')
  }

  const authResult = requireAccessTokenAuth(req)
  if (!authResult.allowed) {
    return sendError(res, authResult.statusCode, authResult.message)
  }

  // Rate limiting: 5 requests per minute per IP
  const clientIp = getClientIp(req)
  const limit = rateLimit(`token-${clientIp}`, 5, 60000)

  if (!limit.allowed) {
    res.setHeader('Retry-After', Math.ceil((limit.resetTime - Date.now()) / 1000))
    return sendError(res, 429, 'Too many requests')
  }

  // Validate required fields
  const validationError = validateFields(req.body, ['provider', 'code', 'state', 'codeVerifier'])
  if (validationError) {
    return sendError(res, 400, validationError)
  }

  const { provider, code, state, codeVerifier } = req.body

  // Validate code format without over-constraining provider-specific values
  if (typeof code !== 'string' || code.length < 10 || code.length > 2048) {
    return sendError(res, 400, 'Invalid authorization code format')
  }

  if (/[\u0000-\u001F\u007F\s]/.test(code)) {
    return sendError(res, 400, 'Invalid authorization code characters')
  }

  let config
  try {
    config = getProviderConfig(provider)
    const signedState = verifySignedState(state)

    if (signedState.provider !== provider.toLowerCase()) {
      return sendError(res, 400, 'State does not match provider')
    }

    if (signedState.requestOrigin) {
      if (typeof req.headers.origin !== 'string') {
        return sendError(res, 400, 'State requires a matching request origin')
      }

      if (signedState.requestOrigin !== req.headers.origin) {
        return sendError(res, 400, 'State does not match request origin')
      }
    }

    verifyPkceCodeVerifier(codeVerifier, signedState.codeChallenge)
  } catch (error) {
    return sendError(res, 400, error.message || 'Invalid token exchange request')
  }

  try {
    const tokens = normalizeTokenPayload(await postOAuthForm(config.tokenUrl, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }))

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    sendSuccess(res, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    }, { noStore: true })
  } catch (error) {
    console.error('Token exchange error:', error)
    if (error instanceof UpstreamOAuthError) {
      return sendError(res, error.statusCode, error.message)
    }
    sendError(res, 500, error.message || 'Failed to exchange token')
  }
}
