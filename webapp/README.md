# ML Sidecar Console

React + Vite web console for the ML Sidecar iPhone server.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest + Testing Library + MSW
npm run build      # production build in dist/ + single-file ml-sidecar-console.html
```

Enter the phone's address from the ML Sidecar app (e.g. `http://192.168.1.20:8080`)
and connect. Each capability gets a panel; unavailable ones are marked with the
reason the phone reports.

## Single-file console

`npm run build` also emits `ml-sidecar-console.html` at the repo root: the
whole console — CSS, JavaScript, favicon, and the microphone worklet — inlined
into one HTML file. Anyone who has the ML Sidecar app on their phone can
download that one file, open it in a browser (double-click works; `file://` is
a secure context, so the microphone is available), enter the phone's address,
and connect. The phone's CORS policy is `*`, which accepts the `null` origin a
local file sends.

The file is committed so the iOS app can link people straight to it on GitHub.
After changing the console, re-run `npm run build` and commit the regenerated
file with your change.

Notes:

- Serve over **http://localhost** (the default dev server). An `https://` origin
  would block requests to the phone's `http://` address as mixed content.
- Microphone capture is encoded to WAV in the browser (the server can't decode
  webm/opus). `getUserMedia` needs a secure context, which `localhost` is.
- If auth is enabled on the phone, paste the bearer token via the "token" toggle
  in the sidebar.
