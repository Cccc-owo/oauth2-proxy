export default function handler(req, res) {
  const forwardedProto = req.headers['x-forwarded-proto']
  const host = req.headers.host
  const baseUrl = forwardedProto && host
    ? `${forwardedProto}://${host}`
    : null

  const target = new URL('mailyou://oauth/callback')

  const append = (key) => {
    const value = req.query[key]
    if (typeof value === 'string' && value.length > 0) {
      target.searchParams.set(key, value)
    }
  }

  append('code')
  append('state')
  append('error')
  append('error_description')

  const fallbackUrl = baseUrl
    ? `${baseUrl}/docs`
    : 'https://oauth2-proxy.iscccc.cc/docs'

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Return to MailYou</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(160deg, #f4f6fb 0%, #dce7ff 100%);
        color: #182033;
      }
      main {
        width: min(92vw, 540px);
        padding: 32px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 20px 60px rgba(36, 58, 99, 0.18);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.5;
      }
      a {
        color: #2157d5;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Returning to MailYou</h1>
      <p>If MailYou does not open automatically, use the button below.</p>
      <p><a href="${target.toString()}">Open MailYou</a></p>
      <p>You can close this tab after the app finishes signing in.</p>
    </main>
    <script>
      const target = ${JSON.stringify(target.toString())};
      const fallback = ${JSON.stringify(fallbackUrl)};
      window.location.replace(target);
      setTimeout(() => {
        const link = document.querySelector('a');
        if (link) {
          link.setAttribute('href', target);
        }
      }, 50);
      setTimeout(() => {
        window.location.href = fallback;
      }, 2500);
    </script>
  </body>
</html>`)
}
