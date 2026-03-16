import { getProviderConfig } from './_lib/providers.js'
import { applyRequestPolicy, handleOptions, sendError, sendSuccess } from './_lib/response.js'
import { createSignedState, validatePkceChallenge } from './_lib/security.js'

export default function handler(req, res) {
  // Handle OPTIONS
  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return
  if (handleOptions(req, res)) return

  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return

  // Only allow GET
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed')
  }

  const {
    provider,
    state: clientState,
    codeChallenge,
    codeChallengeMethod = 'S256',
  } = req.query

  if (!provider) {
    return sendError(res, 400, 'Missing provider parameter')
  }

  const pkceError = validatePkceChallenge(codeChallenge, codeChallengeMethod)
  if (pkceError) {
    return sendError(res, 400, pkceError)
  }

  try {
    const config = getProviderConfig(provider)
    const state = createSignedState({
      provider: provider.toLowerCase(),
      codeChallenge,
      codeChallengeMethod,
      clientState,
      requestOrigin: req.headers.origin || null,
    })

    const authUrl = new URL(config.authUrl)
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('redirect_uri', config.redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', config.scopes.join(' '))
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', codeChallengeMethod)
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    for (const [key, value] of Object.entries(config.authParams || {})) {
      authUrl.searchParams.set(key, value)
    }

    sendSuccess(res, { authUrl: authUrl.toString(), state })
  } catch (error) {
    sendError(res, 400, error.message)
  }
}
