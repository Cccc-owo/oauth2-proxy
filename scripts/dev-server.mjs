import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const port = Number(process.env.PORT || 3000)

const staticRoutes = new Map([
  ['/docs', { file: 'docs/index.html', type: 'text/html; charset=utf-8' }],
  ['/docs/', { file: 'docs/index.html', type: 'text/html; charset=utf-8' }],
])

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function attachResponseHelpers(res) {
  res.status = function status(code) {
    this.statusCode = code
    return this
  }

  res.json = function json(payload) {
    if (!this.getHeader('Content-Type')) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    this.end(JSON.stringify(payload))
    return this
  }

  return res
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return undefined
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) {
    return undefined
  }

  const contentType = req.headers['content-type'] || ''
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw)
    } catch {
      return { __parseError: true }
    }
  }

  return raw
}

async function serveStatic(res, relativeFile, contentType) {
  const filePath = path.join(rootDir, relativeFile)
  try {
    await stat(filePath)
  } catch {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', contentType)
  createReadStream(filePath).pipe(res)
}

async function serveApi(req, res, pathname, searchParams) {
  const relativeModule = `.${pathname}.js`
  const filePath = path.join(rootDir, pathname.endsWith('.js') ? pathname : `${pathname}.js`)

  try {
    await stat(filePath)
  } catch {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  const moduleUrl = pathToFileURL(filePath).href
  const mod = await import(moduleUrl)
  const handler = mod.default

  const body = await readBody(req)
  if (body && body.__parseError) {
    sendJson(res, 400, { error: 'Invalid request body' })
    return
  }

  req.query = Object.fromEntries(searchParams.entries())
  req.body = body
  req.url = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  req.headers.host = req.headers.host || `localhost:${port}`

  attachResponseHelpers(res)
  await handler(req, res)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`)
    const { pathname, searchParams } = url

    if (pathname === '/') {
      res.statusCode = 302
      res.setHeader('Location', '/docs')
      res.end()
      return
    }

    if (staticRoutes.has(pathname)) {
      const route = staticRoutes.get(pathname)
      await serveStatic(res, route.file, route.type)
      return
    }

    if (pathname.startsWith('/api/')) {
      await serveApi(req, res, pathname, searchParams)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Internal server error' })
  }
})

server.listen(port, () => {
  console.log(`Local dev server running at http://localhost:${port}`)
})
