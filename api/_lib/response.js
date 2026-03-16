import { setSecurityHeaders, validateOrigin } from './rateLimit.js'

// Standard CORS headers
export function setCorsHeaders(res, allowedOrigin) {
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (allowedOrigin && allowedOrigin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
}

export function applyRequestPolicy(req, res, options = {}) {
  const { allowMissingOrigin = false } = options

  const originCheck = validateOrigin(req)

  if (!originCheck.allowed) {
    if (allowMissingOrigin && req.headers.origin === undefined) {
      setCorsHeaders(res, undefined)
      setSecurityHeaders(res)
      return true
    }

    setSecurityHeaders(res)
    sendError(res, 403, 'Origin not allowed')
    return false
  }

  setCorsHeaders(res, originCheck.origin || undefined)
  setSecurityHeaders(res)
  return true
}

// Handle OPTIONS preflight after request policy has applied CORS/security headers
export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

// Sanitize error message - prevent information leakage
function sanitizeErrorMessage(message) {
  if (typeof message !== 'string') {
    return 'An error occurred'
  }

  // Remove sensitive information patterns
  const sanitized = message
    .replace(/client_secret[=:]\s*\S+/gi, 'client_secret=***')
    .replace(/password[=:]\s*\S+/gi, 'password=***')
    .replace(/token[=:]\s*\S+/gi, 'token=***')
    .replace(/key[=:]\s*\S+/gi, 'key=***')

  // Limit message length
  return sanitized.substring(0, 200)
}

// Standard error response
export function sendError(res, statusCode, message) {
  const sanitized = sanitizeErrorMessage(message)
  res.status(statusCode).json({ error: sanitized })
}

// Standard success response
export function sendSuccess(res, data, options = {}) {
  const { noStore = false } = options

  if (noStore) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Pragma', 'no-cache')
  }

  res.status(200).json(data)
}

// Validate required fields
export function validateFields(body, requiredFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Invalid request body'
  }

  const missing = requiredFields.filter(
    field => !(field in body) || body[field] === undefined || body[field] === null,
  )
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`
  }
  return null
}
