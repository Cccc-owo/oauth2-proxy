import { createPrivateKey, sign as signJwtPayload } from 'node:crypto'

// OAuth2 provider configurations
export const providers = {
  gmail: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://mail.google.com/'],
    clientIdEnv: 'GMAIL_CLIENT_ID',
    clientSecretEnv: 'GMAIL_CLIENT_SECRET',
    redirectUriEnv: 'GMAIL_REDIRECT_URI',
  },
  outlook: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'https://outlook.office.com/IMAP.AccessAsUser.All',
      'https://outlook.office.com/SMTP.Send',
      'offline_access',
    ],
    clientIdEnv: 'OUTLOOK_CLIENT_ID',
    clientSecretEnv: 'OUTLOOK_CLIENT_SECRET',
    redirectUriEnv: 'OUTLOOK_REDIRECT_URI',
  },
  icloud: {
    authUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    scopes: ['email'],
    clientIdEnv: 'ICLOUD_CLIENT_ID',
    redirectUriEnv: 'ICLOUD_REDIRECT_URI',
    authParams: {
      response_mode: 'form_post',
    },
    requiredEnv: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'],
    clientSecretFactory: createAppleClientSecret,
  },
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

function createAppleClientSecret(clientId) {
  const teamId = process.env.APPLE_TEAM_ID
  const keyId = process.env.APPLE_KEY_ID
  const privateKeyPem = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!teamId || !keyId || !privateKeyPem) {
    throw new Error('OAuth2 not configured for icloud')
  }

  if (!clientId) {
    throw new Error('OAuth2 not configured for icloud')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`
  let signature
  try {
    const privateKey = createPrivateKey(privateKeyPem)
    signature = signJwtPayload('sha256', Buffer.from(unsignedToken), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    })
  } catch {
    throw new Error('Invalid Apple private key configuration')
  }

  return `${unsignedToken}.${signature.toString('base64url')}`
}

function validateIcloudRedirectUri(redirectUri) {
  let parsedRedirectUri
  try {
    parsedRedirectUri = new URL(redirectUri)
  } catch {
    throw new Error('Invalid redirect URI for icloud')
  }

  if (parsedRedirectUri.protocol !== 'https:' || parsedRedirectUri.hostname === 'localhost') {
    throw new Error('iCloud redirect URI must be HTTPS and not localhost')
  }
}

function assertProviderConfigured(providerName) {
  const provider = providers[providerName]
  const clientId = process.env[provider.clientIdEnv]
  const redirectUri = process.env[provider.redirectUriEnv]

  if (!clientId || !redirectUri) {
    throw new Error(`OAuth2 not configured for ${providerName}`)
  }

  if (provider.requiredEnv) {
    for (const envName of provider.requiredEnv) {
      if (!process.env[envName]) {
        throw new Error(`OAuth2 not configured for ${providerName}`)
      }
    }
  }

  if (provider.clientSecretFactory) {
    const privateKeyPem = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    try {
      createPrivateKey(privateKeyPem)
    } catch {
      throw new Error('Invalid Apple private key configuration')
    }
  } else {
    const clientSecret = process.env[provider.clientSecretEnv]
    if (!clientSecret) {
      throw new Error(`OAuth2 not configured for ${providerName}`)
    }
  }

  if (providerName === 'icloud') {
    validateIcloudRedirectUri(redirectUri)
  }

  return { clientId, redirectUri }
}

// Check if a provider is enabled
function isProviderEnabled(providerName) {
  const enabledProviders = process.env.ENABLED_PROVIDERS?.toLowerCase().split(',').map(p => p.trim())

  // If ENABLED_PROVIDERS is not set, all configured providers are enabled
  if (!enabledProviders) {
    return true
  }

  // If set to 'all', enable all providers
  if (enabledProviders.includes('all')) {
    return true
  }

  return enabledProviders.includes(providerName.toLowerCase())
}

export function getProviderConfig(providerName) {
  // Input validation - prevent prototype pollution and injection
  if (!providerName || typeof providerName !== 'string') {
    throw new Error('Invalid provider name')
  }

  // Sanitize input - only allow alphanumeric characters
  const sanitized = providerName.toLowerCase().replace(/[^a-z0-9]/g, '')

  // Use hasOwnProperty to prevent prototype pollution
  if (!Object.prototype.hasOwnProperty.call(providers, sanitized)) {
    throw new Error(`Unsupported provider: ${providerName}`)
  }

  // Check if provider is enabled
  if (!isProviderEnabled(sanitized)) {
    throw new Error(`Provider not enabled: ${providerName}`)
  }

  const provider = providers[sanitized]
  const { clientId, redirectUri } = assertProviderConfigured(sanitized)

  let clientSecret
  if (provider.clientSecretFactory) {
    clientSecret = provider.clientSecretFactory(clientId)
  } else {
    clientSecret = process.env[provider.clientSecretEnv]
  }

  return {
    ...provider,
    clientId,
    clientSecret,
    redirectUri,
  }
}

// Get list of available (configured and enabled) providers
export function getAvailableProviders() {
  const available = []

  for (const name of Object.keys(providers)) {
    try {
      if (!isProviderEnabled(name)) {
        continue
      }
      assertProviderConfigured(name)
      available.push(name)
    } catch {
      // Ignore providers that are disabled, incomplete, or invalid.
    }
  }

  return available
}
