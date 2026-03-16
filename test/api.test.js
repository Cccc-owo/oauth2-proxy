import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'

import authUrlHandler from '../api/auth-url.js'
import openApiHandler from '../api/openapi.js'
import providersHandler from '../api/providers.js'
import refreshHandler from '../api/refresh.js'
import tokenHandler from '../api/token.js'
import { applyRequestPolicy, validateFields } from '../api/_lib/response.js'
import { getProviderConfig } from '../api/_lib/providers.js'
import { getClientIp, rateLimit } from '../api/_lib/rateLimit.js'
import { createSignedState } from '../api/_lib/security.js'

const TEST_STATE_SECRET = 'test-state-secret-should-be-at-least-32-chars'
const TEST_CODE_VERIFIER = 'verifier-string-with-high-entropy-1234567890ABCDE'
const TEST_CODE_CHALLENGE = createHash('sha256').update(TEST_CODE_VERIFIER).digest('base64url')

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
}

function withEnv(values, fn) {
  const previous = {}

  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

test('applyRequestPolicy rejects disallowed origins', async () => {
  await withEnv({ ALLOWED_ORIGINS: 'https://allowed.example' }, () => {
    const req = { headers: { origin: 'https://blocked.example' } }
    const res = createResponse()

    const allowed = applyRequestPolicy(req, res)

    assert.equal(allowed, false)
    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.body, { error: 'Origin not allowed' })
  })
})

test('applyRequestPolicy echoes allowed origin for credentialed browser calls', async () => {
  await withEnv({ ALLOWED_ORIGINS: 'https://app.example' }, () => {
    const req = {
      headers: {
        origin: 'https://app.example',
        referer: 'https://app.example/settings',
      },
    }
    const res = createResponse()

    const allowed = applyRequestPolicy(req, res)

    assert.equal(allowed, true)
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://app.example')
    assert.equal(res.headers['Access-Control-Allow-Credentials'], 'true')
    assert.equal(res.headers.Vary, 'Origin')
  })
})

test('auth-url returns a state parameter and embeds it in the authorization URL', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      STATE_SECRET: TEST_STATE_SECRET,
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const req = {
        method: 'GET',
        headers: {},
        query: { provider: 'gmail', codeChallenge: TEST_CODE_CHALLENGE, codeChallengeMethod: 'S256' },
      }
      const res = createResponse()

      authUrlHandler(req, res)

      assert.equal(res.statusCode, 200)
      assert.equal(typeof res.body.state, 'string')
      assert.ok(res.body.state.length > 20)

      const authUrl = new URL(res.body.authUrl)
      assert.equal(authUrl.searchParams.get('state'), res.body.state)
      assert.equal(authUrl.searchParams.get('code_challenge'), TEST_CODE_CHALLENGE)
      assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256')
    },
  )
})

test('providers endpoint only lists fully configured providers', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: undefined,
    },
    async () => {
      const req = {
        method: 'GET',
        headers: {},
      }
      const res = createResponse()

      providersHandler(req, res)

      assert.equal(res.statusCode, 200)
      assert.deepEqual(res.body, { providers: [] })
    },
  )
})

test('openapi endpoint returns an OpenAPI document with the main routes', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
    },
    () => {
      const req = {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
        },
      }
      const res = createResponse()

      openApiHandler(req, res)

      assert.equal(res.statusCode, 200)
      assert.equal(res.body.openapi, '3.1.0')
      assert.equal(res.body.info.title, 'OAuth2 Proxy API')
      assert.equal(res.body.servers[0].url, 'http://localhost:3000')
      assert.ok(res.body.paths['/api/providers'])
      assert.ok(res.body.paths['/api/auth-url'])
      assert.ok(res.body.paths['/api/token'])
      assert.ok(res.body.paths['/api/refresh'])
    },
  )
})

test('providers endpoint excludes invalid icloud configuration', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      ENABLED_PROVIDERS: 'icloud',
      ICLOUD_CLIENT_ID: 'icloud-client-id',
      ICLOUD_REDIRECT_URI: 'http://localhost:8080/oauth2/callback',
      APPLE_TEAM_ID: 'team-id',
      APPLE_KEY_ID: 'key-id',
      APPLE_PRIVATE_KEY: 'invalid-key',
    },
    async () => {
      const req = {
        method: 'GET',
        headers: {},
      }
      const res = createResponse()

      providersHandler(req, res)

      assert.equal(res.statusCode, 200)
      assert.deepEqual(res.body, { providers: [] })
    },
  )
})

test('providers endpoint does not require Apple JWT signing to list icloud', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      ENABLED_PROVIDERS: 'icloud',
      ICLOUD_CLIENT_ID: 'com.example.web',
      ICLOUD_REDIRECT_URI: 'https://app.example/oauth2/callback',
      APPLE_TEAM_ID: 'TEAMID1234',
      APPLE_KEY_ID: 'KEYID12345',
      APPLE_PRIVATE_KEY: privateKeyPem,
    },
    async () => {
      const req = {
        method: 'GET',
        headers: {},
      }
      const res = createResponse()

      providersHandler(req, res)

      assert.equal(res.statusCode, 200)
      assert.deepEqual(res.body, { providers: ['icloud'] })
    },
  )
})

test('icloud configuration returns a sanitized private key error', async () => {
  await withEnv(
    {
      ENABLED_PROVIDERS: 'icloud',
      ICLOUD_CLIENT_ID: 'icloud-client-id',
      ICLOUD_REDIRECT_URI: 'https://app.example/oauth2/callback',
      APPLE_TEAM_ID: 'team-id',
      APPLE_KEY_ID: 'key-id',
      APPLE_PRIVATE_KEY: 'invalid-key',
    },
    async () => {
      assert.throws(
        () => getProviderConfig('icloud'),
        /Invalid Apple private key configuration/,
      )
    },
  )
})

test('token exchange accepts provider codes with plus signs', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      STATE_SECRET: TEST_STATE_SECRET,
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const originalFetch = global.fetch
      const calls = []
      global.fetch = async (_url, options) => {
        calls.push(options.body.toString())
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
          }),
        }
      }

      try {
        const state = createSignedState({
          provider: 'gmail',
          codeChallenge: TEST_CODE_CHALLENGE,
          codeChallengeMethod: 'S256',
          requestOrigin: null,
        })
        const req = {
          method: 'POST',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
          body: { provider: 'gmail', code: 'abc+def/ghi=123', state, codeVerifier: TEST_CODE_VERIFIER },
        }
        const res = createResponse()

        await tokenHandler(req, res)

        assert.equal(res.statusCode, 200)
        assert.match(calls[0], /code=abc%2Bdef%2Fghi%3D123/)
        assert.match(calls[0], /code_verifier=verifier-string-with-high-entropy-1234567890ABCDE/)
      } finally {
        global.fetch = originalFetch
      }
    },
  )
})

test('token exchange returns 504 when the provider times out', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      STATE_SECRET: TEST_STATE_SECRET,
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const originalFetch = global.fetch
      global.fetch = async () => {
        const error = new Error('timed out')
        error.name = 'TimeoutError'
        throw error
      }

      try {
        const state = createSignedState({
          provider: 'gmail',
          codeChallenge: TEST_CODE_CHALLENGE,
          codeChallengeMethod: 'S256',
          requestOrigin: null,
        })
        const req = {
          method: 'POST',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
          body: { provider: 'gmail', code: 'abc+def/ghi=123', state, codeVerifier: TEST_CODE_VERIFIER },
        }
        const res = createResponse()

        await tokenHandler(req, res)

        assert.equal(res.statusCode, 504)
        assert.deepEqual(res.body, { error: 'OAuth provider request timed out' })
      } finally {
        global.fetch = originalFetch
      }
    },
  )
})

test('token exchange returns 502 when the provider omits expires_in', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      STATE_SECRET: TEST_STATE_SECRET,
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const originalFetch = global.fetch
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          access_token: 'access-token',
        }),
      })

      try {
        const state = createSignedState({
          provider: 'gmail',
          codeChallenge: TEST_CODE_CHALLENGE,
          codeChallengeMethod: 'S256',
          requestOrigin: null,
        })
        const req = {
          method: 'POST',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
          body: { provider: 'gmail', code: 'abc+def/ghi=123', state, codeVerifier: TEST_CODE_VERIFIER },
        }
        const res = createResponse()

        await tokenHandler(req, res)

        assert.equal(res.statusCode, 502)
        assert.deepEqual(res.body, { error: 'OAuth provider returned an invalid response' })
      } finally {
        global.fetch = originalFetch
      }
    },
  )
})

test('refresh accepts provider refresh tokens with plus signs', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const originalFetch = global.fetch
      const calls = []
      global.fetch = async (_url, options) => {
        calls.push(options.body.toString())
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token',
            expires_in: 3600,
          }),
        }
      }

      try {
        const req = {
          method: 'POST',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
          body: { provider: 'gmail', refreshToken: 'refresh+token/ghi=123' },
        }
        const res = createResponse()

        await refreshHandler(req, res)

        assert.equal(res.statusCode, 200)
        assert.match(calls[0], /refresh_token=refresh%2Btoken%2Fghi%3D123/)
      } finally {
        global.fetch = originalFetch
      }
    },
  )
})

test('validateFields accepts falsy but present values', () => {
  assert.equal(validateFields({ enabled: false, count: 0, name: '' }, ['enabled', 'count', 'name']), null)
})

test('getClientIp falls back to socket address when proxy headers are invalid', async () => {
  await withEnv({ TRUST_PROXY_HEADERS: 'true' }, () => {
    const ip = getClientIp({
      headers: {
        'x-forwarded-for': 'not-an-ip',
      },
      socket: { remoteAddress: '127.0.0.1' },
    })

    assert.equal(ip, '127.0.0.1')
  })
})

test('rateLimit evicts old entries instead of rejecting new identifiers when full', () => {
  for (let index = 0; index < 10000; index++) {
    rateLimit(`saturation-${index}`, 10, 60000)
  }

  const result = rateLimit('fresh-client-after-saturation', 10, 60000)

  assert.equal(result.allowed, true)
  assert.equal(result.remaining, 9)
})

test('icloud provider generates a runtime JWT client secret', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

  await withEnv(
    {
      ICLOUD_CLIENT_ID: 'com.example.web',
      ICLOUD_REDIRECT_URI: 'https://app.example/oauth2/callback',
      APPLE_TEAM_ID: 'TEAMID1234',
      APPLE_KEY_ID: 'KEYID12345',
      APPLE_PRIVATE_KEY: privateKeyPem,
    },
    () => {
      const config = getProviderConfig('icloud')
      const [header, payload, signature] = config.clientSecret.split('.')

      assert.equal(typeof signature, 'string')
      assert.ok(signature.length > 0)

      const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
      const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))

      assert.deepEqual(decodedHeader, { alg: 'ES256', kid: 'KEYID12345', typ: 'JWT' })
      assert.equal(decodedPayload.iss, 'TEAMID1234')
      assert.equal(decodedPayload.sub, 'com.example.web')
      assert.equal(decodedPayload.aud, 'https://appleid.apple.com')
      assert.equal(decodedPayload.exp - decodedPayload.iat, 300)
    },
  )
})

test('icloud auth-url includes response_mode=form_post', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      STATE_SECRET: TEST_STATE_SECRET,
      ICLOUD_CLIENT_ID: 'com.example.web',
      ICLOUD_REDIRECT_URI: 'https://app.example/oauth2/callback',
      APPLE_TEAM_ID: 'TEAMID1234',
      APPLE_KEY_ID: 'KEYID12345',
      APPLE_PRIVATE_KEY: privateKeyPem,
    },
    async () => {
      const req = {
        method: 'GET',
        headers: {},
        query: { provider: 'icloud', codeChallenge: TEST_CODE_CHALLENGE, codeChallengeMethod: 'S256' },
      }
      const res = createResponse()

      authUrlHandler(req, res)

      assert.equal(res.statusCode, 200)
      const authUrl = new URL(res.body.authUrl)
      assert.equal(authUrl.searchParams.get('response_mode'), 'form_post')
    },
  )
})

test('server-to-server request is allowed without origin header', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: 'https://app.example',
    },
    () => {
      const req = { headers: {} }
      const res = createResponse()

      const allowed = applyRequestPolicy(req, res, { allowMissingOrigin: true })

      assert.equal(allowed, true)
      assert.equal(res.statusCode, 200)
    },
  )
})

test('request policy rejects opaque origin when browser origins are restricted', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: 'https://app.example',
    },
    () => {
      const req = { headers: { origin: 'null' } }
      const res = createResponse()

      const allowed = applyRequestPolicy(req, res, { allowMissingOrigin: true })

      assert.equal(allowed, false)
      assert.equal(res.statusCode, 403)
      assert.deepEqual(res.body, { error: 'Origin not allowed' })
    },
  )
})

test('preflight returns CORS headers for allowed origin without authentication', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: 'https://app.example',
    },
    async () => {
      const req = {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example',
          referer: 'https://app.example/settings',
        },
      }
      const res = createResponse()

      authUrlHandler(req, res)

      assert.equal(res.statusCode, 204)
      assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://app.example')
      assert.equal(res.headers['Access-Control-Allow-Headers'], 'Content-Type, Authorization')
      assert.equal(res.headers['Access-Control-Allow-Credentials'], 'true')
      assert.equal(res.ended, true)
    },
  )
})

test('providers endpoint is publicly accessible', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const req = {
        method: 'GET',
        headers: {},
      }
      const res = createResponse()

      providersHandler(req, res)

      assert.equal(res.statusCode, 200)
      assert.deepEqual(res.body, { providers: ['gmail'] })
    },
  )
})

test('token exchange requires the same origin when state was issued to a browser origin', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: 'https://app.example',
      STATE_SECRET: TEST_STATE_SECRET,
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const state = createSignedState({
        provider: 'gmail',
        codeChallenge: TEST_CODE_CHALLENGE,
        codeChallengeMethod: 'S256',
        requestOrigin: 'https://app.example',
      })
      const req = {
        method: 'POST',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
        body: { provider: 'gmail', code: 'abc+def/ghi=123', state, codeVerifier: TEST_CODE_VERIFIER },
      }
      const res = createResponse()

      await tokenHandler(req, res)

      assert.equal(res.statusCode, 400)
      assert.deepEqual(res.body, { error: 'State requires a matching request origin' })
    },
  )
})

test('token exchange responses disable caching', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      STATE_SECRET: TEST_STATE_SECRET,
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const originalFetch = global.fetch
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
      })

      try {
        const state = createSignedState({
          provider: 'gmail',
          codeChallenge: TEST_CODE_CHALLENGE,
          codeChallengeMethod: 'S256',
          requestOrigin: null,
        })
        const req = {
          method: 'POST',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
          body: { provider: 'gmail', code: 'abc+def/ghi=123', state, codeVerifier: TEST_CODE_VERIFIER },
        }
        const res = createResponse()

        await tokenHandler(req, res)

        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['Cache-Control'], 'no-store')
        assert.equal(res.headers.Pragma, 'no-cache')
      } finally {
        global.fetch = originalFetch
      }
    },
  )
})

test('refresh responses disable caching', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const originalFetch = global.fetch
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          access_token: 'access-token',
          expires_in: 3600,
        }),
      })

      try {
        const req = {
          method: 'POST',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
          body: { provider: 'gmail', refreshToken: 'refresh+token/ghi=123' },
        }
        const res = createResponse()

        await refreshHandler(req, res)

        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['Cache-Control'], 'no-store')
        assert.equal(res.headers.Pragma, 'no-cache')
      } finally {
        global.fetch = originalFetch
      }
    },
  )
})

test('token exchange rejects tampered state', async () => {
  await withEnv(
    {
      ALLOWED_ORIGINS: '*',
      STATE_SECRET: TEST_STATE_SECRET,
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: 'client-secret',
      GMAIL_REDIRECT_URI: 'https://app.example/oauth2/callback',
    },
    async () => {
      const req = {
        method: 'POST',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
        body: {
          provider: 'gmail',
          code: 'abc+def/ghi=123',
          state: 'tampered.state',
          codeVerifier: TEST_CODE_VERIFIER,
        },
      }
      const res = createResponse()

      await tokenHandler(req, res)

      assert.equal(res.statusCode, 400)
      assert.deepEqual(res.body, { error: 'Invalid state signature' })
    },
  )
})

test('getClientIp ignores spoofed forwarding headers unless explicitly trusted', async () => {
  await withEnv({ TRUST_PROXY_HEADERS: undefined }, async () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.10' },
      socket: { remoteAddress: '127.0.0.1' },
    }

    assert.equal(getClientIp(req), '127.0.0.1')
  })
})
