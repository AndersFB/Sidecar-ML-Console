# Sidecar ML Console

React + Vite web console for the Sidecar ML iPhone server.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest + Testing Library + MSW
npm run build      # production build in dist/ + single-file dist/sidecar-ml-console.html
```

Enter the phone's address from the Sidecar ML app (e.g. `http://192.168.1.20:8080`)
and connect. Each capability gets a panel; unavailable ones are marked with the
reason the phone reports.

## Single-file console

The whole console — CSS, JavaScript, favicon, and the microphone worklet —
also ships as one self-contained HTML file. Download it, open it in a browser
(double-click works; `file://` is a secure context, so the microphone is
available), enter the phone's address, and connect. The phone's CORS policy is
`*`, which accepts the `null` origin a local file sends.

**Download it** from the latest release (stable URL, also what the iOS app
links):

    https://github.com/AndersFB/Sidecar-ML-Console/releases/latest/download/sidecar-ml-console.html

**Or build it yourself:**

```bash
npm install
npm run build      # → dist/sidecar-ml-console.html
```

Maintainers: after a console change lands on `main`, run `npm run release` to
update the download (replaces the asset on the release for the current
package.json version, or creates the release if the version is new; needs an
authenticated GitHub CLI).

Notes:

- Serve over **http://localhost** (the default dev server). An `https://` origin
  would block requests to the phone's `http://` address as mixed content.
- Microphone capture is encoded to WAV in the browser (the server can't decode
  webm/opus). `getUserMedia` needs a secure context, which `localhost` is.
- If auth is enabled on the phone, paste the bearer token via the "token" toggle
  in the sidebar.
