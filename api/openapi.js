import { applyRequestPolicy, handleOptions, sendError } from './_lib/response.js'
import { providers } from './_lib/providers.js'

function getServerUrl(req) {
  const proto = req.headers['x-forwarded-proto']
    || (req.socket?.encrypted ? 'https' : 'http')
  const host = req.headers['x-forwarded-host'] || req.headers.host

  if (!host) {
    return null
  }

  return `${proto}://${host}`
}

function buildSpec(req) {
  const providerNames = Object.keys(providers)
  const serverUrl = getServerUrl(req)

  return {
    openapi: '3.1.0',
    info: {
      title: 'OAuth2 Proxy API',
      version: '1.0.0',
      description: 'Serverless OAuth2 proxy for browser and public-client flows.',
    },
    servers: serverUrl ? [{ url: serverUrl }] : [],
    tags: [
      { name: 'Meta', description: 'Project metadata and provider discovery.' },
      { name: 'OAuth', description: 'OAuth2 authorization, token exchange, and refresh flows.' },
    ],
    paths: {
      '/api/providers': {
        get: {
          tags: ['Meta'],
          summary: 'List available providers',
          description: 'Returns providers that are both configured and enabled in the current deployment.',
          responses: {
            200: {
              description: 'Configured providers',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['providers'],
                    properties: {
                      providers: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: providerNames,
                        },
                      },
                    },
                  },
                },
              },
            },
            405: { $ref: '#/components/responses/ErrorResponse' },
          },
        },
      },
      '/api/auth-url': {
        get: {
          tags: ['OAuth'],
          summary: 'Generate an authorization URL',
          description: 'Builds a provider authorization URL and returns a signed state payload for the callback step.',
          parameters: [
            {
              name: 'provider',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: providerNames },
            },
            {
              name: 'codeChallenge',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
                pattern: '^[A-Za-z0-9_-]{43,128}$',
              },
            },
            {
              name: 'codeChallengeMethod',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['S256'],
                default: 'S256',
              },
            },
            {
              name: 'state',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Optional client state to embed in the signed state blob.',
            },
          ],
          responses: {
            200: {
              description: 'Authorization URL and signed state',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['authUrl', 'state'],
                    properties: {
                      authUrl: {
                        type: 'string',
                        format: 'uri',
                      },
                      state: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            405: { $ref: '#/components/responses/ErrorResponse' },
          },
        },
      },
      '/api/token': {
        post: {
          tags: ['OAuth'],
          summary: 'Exchange an authorization code for tokens',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TokenExchangeRequest',
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Issued access and refresh tokens',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TokenResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            405: { $ref: '#/components/responses/ErrorResponse' },
            429: { $ref: '#/components/responses/ErrorResponse' },
            500: { $ref: '#/components/responses/ErrorResponse' },
            502: { $ref: '#/components/responses/ErrorResponse' },
            504: { $ref: '#/components/responses/ErrorResponse' },
          },
        },
      },
      '/api/refresh': {
        post: {
          tags: ['OAuth'],
          summary: 'Refresh an access token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RefreshRequest',
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Refreshed token set',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TokenResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/ErrorResponse' },
            405: { $ref: '#/components/responses/ErrorResponse' },
            429: { $ref: '#/components/responses/ErrorResponse' },
            500: { $ref: '#/components/responses/ErrorResponse' },
            502: { $ref: '#/components/responses/ErrorResponse' },
            504: { $ref: '#/components/responses/ErrorResponse' },
          },
        },
      },
    },
    components: {
      schemas: {
        TokenExchangeRequest: {
          type: 'object',
          required: ['provider', 'code', 'state', 'codeVerifier'],
          properties: {
            provider: { type: 'string', enum: providerNames },
            code: { type: 'string', minLength: 10, maxLength: 2048 },
            state: { type: 'string' },
            codeVerifier: {
              type: 'string',
              pattern: '^[A-Za-z0-9._~-]{43,128}$',
            },
          },
        },
        RefreshRequest: {
          type: 'object',
          required: ['provider', 'refreshToken'],
          properties: {
            provider: { type: 'string', enum: providerNames },
            refreshToken: { type: 'string', minLength: 10, maxLength: 2048 },
          },
        },
        TokenResponse: {
          type: 'object',
          required: ['accessToken', 'refreshToken', 'expiresAt'],
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
          },
        },
      },
      responses: {
        ErrorResponse: {
          description: 'Standard error response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
  }
}

export default function handler(req, res) {
  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return
  if (handleOptions(req, res)) return

  if (!applyRequestPolicy(req, res, { allowMissingOrigin: true })) return

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed')
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(200).json(buildSpec(req))
}
