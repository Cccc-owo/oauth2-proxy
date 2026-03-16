const UPSTREAM_TIMEOUT_MS = 8000

export class UpstreamOAuthError extends Error {
  constructor(message, statusCode, cause) {
    super(message)
    this.name = 'UpstreamOAuthError'
    this.statusCode = statusCode
    this.cause = cause
  }
}

export function normalizeTokenPayload(tokens) {
  if (!tokens || typeof tokens !== 'object') {
    throw new UpstreamOAuthError('OAuth provider returned an invalid response', 502)
  }

  if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
    throw new UpstreamOAuthError('OAuth provider returned an invalid response', 502)
  }

  if (!Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
    throw new UpstreamOAuthError('OAuth provider returned an invalid response', 502)
  }

  return tokens
}

export async function postOAuthForm(url, body) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OAuth upstream request failed:', response.status, errorText)
      throw new UpstreamOAuthError(
        response.status >= 500 ? 'OAuth provider unavailable' : 'OAuth provider rejected the request',
        response.status >= 500 ? 502 : 400,
      )
    }

    return response.json()
  } catch (error) {
    if (error instanceof UpstreamOAuthError) {
      throw error
    }

    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new UpstreamOAuthError('OAuth provider request timed out', 504, error)
    }

    throw new UpstreamOAuthError('Failed to contact OAuth provider', 502, error)
  }
}
