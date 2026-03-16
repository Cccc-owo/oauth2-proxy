import { getAvailableProviders } from './_lib/providers.js'
import { applyRequestPolicy, handleOptions, sendError, sendSuccess } from './_lib/response.js'

export default function handler(req, res) {
  // Handle OPTIONS
  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return
  if (handleOptions(req, res)) return

  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return

  // Only allow GET
  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed')
  }

  const providers = getAvailableProviders()

  sendSuccess(res, { providers })
}
