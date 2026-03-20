function getCallbackAppName() {
  const appName = process.env.CALLBACK_APP_NAME?.trim()
  return appName || 'MailYou'
}

function getCallbackTargetBaseUrl() {
  const targetUrl = process.env.CALLBACK_TARGET_URL?.trim()
  return targetUrl || 'mailyou://oauth/callback'
}

export default function handler(req, res) {
  const appName = getCallbackAppName()
  const target = new URL(getCallbackTargetBaseUrl())

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

  const targetUrl = target.toString()

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Return to ${appName}</title>
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
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 18px 0 14px;
      }
      a {
        color: #2157d5;
        font-weight: 600;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        font: inherit;
        font-weight: 600;
        color: #fff;
        background: #2157d5;
        cursor: pointer;
      }
      code {
        display: block;
        overflow-wrap: anywhere;
        margin: 14px 0 0;
        padding: 12px 14px;
        border-radius: 14px;
        background: #eef3ff;
        color: #182033;
        font-size: 13px;
      }
      #copy-status {
        min-height: 1.5em;
        color: #4a5572;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Returning to ${appName}</h1>
      <p>If ${appName} does not open automatically, use the button below.</p>
      <div class="actions">
        <a href="${targetUrl}">Open ${appName}</a>
        <button id="copy-link" type="button">Copy callback link</button>
      </div>
      <p id="copy-status" aria-live="polite"></p>
      <code id="callback-link">${targetUrl}</code>
      <p>You can close this tab after the app finishes signing in.</p>
    </main>
    <script>
      const target = ${JSON.stringify(targetUrl)};
      window.location.replace(target);
      setTimeout(() => {
        const link = document.querySelector('a');
        if (link) {
          link.setAttribute('href', target);
        }
      }, 50);

      const copyButton = document.getElementById('copy-link');
      const copyStatus = document.getElementById('copy-status');
      const callbackLink = document.getElementById('callback-link');

      async function copyCallbackLink() {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(target);
          } else {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(callbackLink);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
          }
          copyStatus.textContent = 'Callback link copied.';
        } catch {
          copyStatus.textContent = 'Copy failed. Please copy the link manually.';
        }
      }

      copyButton.addEventListener('click', copyCallbackLink);
    </script>
  </body>
</html>`)
}
