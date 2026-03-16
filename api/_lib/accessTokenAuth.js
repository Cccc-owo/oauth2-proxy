import { timingSafeEqual } from 'node:crypto'

function parseBoolean(value) {
  if (typeof value !== 'string') {
    return false
  }

  return value.toLowerCase() === 'true'
}

function getConfiguredTokens() {
  const rawValue = process.env.ACCESS_TOKEN_AUTH_TOKENS || process.env.ACCESS_TOKEN_AUTH_TOKEN

  if (typeof rawValue !== 'string') {
    return []
  }

  return rawValue
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function getBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string' || authorizationHeader.length === 0) {
    return { error: 'Missing Authorization header' }
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)

  if (!match) {
    return { error: 'Authorization header must use Bearer token' }
  }

  const token = match[1].trim()

  if (token.length === 0) {
    return { error: 'Authorization header must use Bearer token' }
  }

  return { token }
}

export function isAccessTokenAuthEnabled() {
  return parseBoolean(process.env.ACCESS_TOKEN_AUTH_ENABLED)
}

export function requireAccessTokenAuth(req) {
  if (!isAccessTokenAuthEnabled()) {
    return { allowed: true }
  }

  const configuredTokens = getConfiguredTokens()

  if (configuredTokens.length === 0) {
    return {
      allowed: false,
      statusCode: 500,
      message: 'Access token authentication is enabled but no access tokens are configured',
    }
  }

  const parsedToken = getBearerToken(req.headers?.authorization)

  if (parsedToken.error) {
    return {
      allowed: false,
      statusCode: 401,
      message: parsedToken.error,
    }
  }

  const matched = configuredTokens.some(configuredToken => safeEqual(parsedToken.token, configuredToken))

  if (!matched) {
    return {
      allowed: false,
      statusCode: 403,
      message: 'Invalid access token',
    }
  }

  return { allowed: true }
}
