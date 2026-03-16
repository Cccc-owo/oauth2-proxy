// Simple in-memory rate limiting with automatic cleanup
const rateLimitStore = new Map()
const CLEANUP_INTERVAL = 300000 // Clean up every 5 minutes
const MAX_STORE_SIZE = 10000 // Prevent memory exhaustion

// Periodic cleanup of expired entries
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, CLEANUP_INTERVAL)

cleanupTimer.unref?.()

function evictExpiredEntries(now) {
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

export function rateLimit(identifier, maxRequests = 10, windowMs = 60000) {
  // Validate identifier
  if (!identifier || typeof identifier !== 'string') {
    return { allowed: false, remaining: 0 }
  }

  const now = Date.now()

  // Prevent memory exhaustion - if store is too large, reject new entries
  if (!rateLimitStore.has(identifier) && rateLimitStore.size >= MAX_STORE_SIZE) {
    evictExpiredEntries(now)
    if (rateLimitStore.size >= MAX_STORE_SIZE) {
      const oldestKey = rateLimitStore.keys().next().value
      if (oldestKey !== undefined) {
        rateLimitStore.delete(oldestKey)
      }
    }
  }

  if (!rateLimitStore.has(identifier)) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1 }
  }

  const record = rateLimitStore.get(identifier)

  if (now > record.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1 }
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime }
  }

  record.count++
  return { allowed: true, remaining: maxRequests - record.count }
}

export function getClientIp(req) {
  const socketIp = req.socket?.remoteAddress
  const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === 'true'

  if (!trustProxyHeaders) {
    return socketIp || 'unknown'
  }

  const forwarded = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
  const realIp = req.headers['x-real-ip']
  const candidate = forwarded || realIp

  // Basic validation - prevent injection. Fall back to the socket IP if proxy headers are malformed.
  if (candidate && /^[\d.:a-fA-F]+$/.test(candidate)) {
    return candidate
  }

  return socketIp || 'unknown'
}

// Validate request origin (optional, for production)
export function validateOrigin(req) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['*']

  if (allowedOrigins.includes('*')) {
    return { allowed: true, origin: '*' }
  }

  const originHeader = req.headers.origin
  if (!originHeader) {
    return { allowed: false, origin: null }
  }

  if (originHeader === 'null') {
    return { allowed: false, origin: null, opaque: true }
  }

  let requestOrigin
  try {
    requestOrigin = new URL(originHeader).origin
  } catch {
    return { allowed: false, origin: null }
  }

  const referer = req.headers.referer
  const matchedOrigin = allowedOrigins.find(allowed => allowed === requestOrigin)

  if (!matchedOrigin) {
    return { allowed: false, origin: requestOrigin }
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      if (refererOrigin !== requestOrigin) {
        return { allowed: false, origin: requestOrigin }
      }
    } catch {
      return { allowed: false, origin: requestOrigin }
    }
  }

  return { allowed: true, origin: matchedOrigin }
}

// Security headers
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Content-Security-Policy', "default-src 'none'")
}
