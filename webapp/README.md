# Sidecar ML Console

React + Vite web console for the Sidecar ML iPhone server.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest + Testing Library + MSW
npm run build      # production build in dist/
```

Enter the phone's address from the Sidecar ML app (e.g. `http://192.168.1.20:8080`)
and connect. Each capability gets a panel; unavailable ones are marked with the
reason the phone reports.

Notes:

- Serve over **http://localhost** (the default dev server). An `https://` origin
  would block requests to the phone's `http://` address as mixed content.
- Microphone capture is encoded to WAV in the browser (the server can't decode
  webm/opus). `getUserMedia` needs a secure context, which `localhost` is.
- If auth is enabled on the phone, paste the bearer token via the "token" toggle
  in the sidebar.
