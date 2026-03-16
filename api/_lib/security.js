import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const STATE_TTL_MS = 10 * 60 * 1000
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/

function getStateSecret() {
  const stateSecret = process.env.STATE_SECRET

  if (!stateSecret || stateSecret.length < 32) {
    throw new Error('STATE_SECRET must be set to a high-entropy secret of at least 32 characters')
  }

  return stateSecret
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function compareStrings(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function signStatePayload(payload) {
  return createHmac('sha256', getStateSecret()).update(payload).digest('base64url')
}

export function validatePkceChallenge(codeChallenge, codeChallengeMethod) {
  if (codeChallengeMethod !== 'S256') {
    return 'codeChallengeMethod must be S256'
  }

  if (typeof codeChallenge !== 'string' || !PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
    return 'Invalid codeChallenge format'
  }

  return null
}

export function validateCodeVerifier(codeVerifier) {
  if (typeof codeVerifier !== 'string' || !PKCE_VERIFIER_PATTERN.test(codeVerifier)) {
    return 'Invalid codeVerifier format'
  }

  return null
}

export function createSignedState({ provider, codeChallenge, codeChallengeMethod, clientState, requestOrigin }) {
  const payload = {
    provider,
    codeChallenge,
    codeChallengeMethod,
    clientState: typeof clientState === 'string' ? clientState : null,
    requestOrigin: requestOrigin || null,
    nonce: randomBytes(16).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  }

  const encodedPayload = base64UrlJson(payload)
  const signature = signStatePayload(encodedPayload)

  return `${encodedPayload}.${signature}`
}

export function verifySignedState(state) {
  if (typeof state !== 'string' || state.length === 0) {
    throw new Error('Missing state')
  }

  const [encodedPayload, signature, extraPart] = state.split('.')
  if (!encodedPayload || !signature || extraPart !== undefined) {
    throw new Error('Invalid state format')
  }

  const expectedSignature = signStatePayload(encodedPayload)
  if (!compareStrings(signature, expectedSignature)) {
    throw new Error('Invalid state signature')
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Invalid state payload')
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid state payload')
  }

  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    throw new Error('State has expired')
  }

  return payload
}

export function verifyPkceCodeVerifier(codeVerifier, expectedCodeChallenge) {
  const verifierError = validateCodeVerifier(codeVerifier)
  if (verifierError) {
    throw new Error(verifierError)
  }

  const computedChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

  if (!compareStrings(computedChallenge, expectedCodeChallenge)) {
    throw new Error('codeVerifier does not match the original codeChallenge')
  }
}
