# Python examples

Talk to the ML Sidecar iPhone server from Python.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

| File | What it shows |
|---|---|
| `client.py` | A typed `SidecarClient` wrapping every endpoint (OCR, chat, TTS, translate, …) |
| `demo.py` | CLI: `python demo.py --base-url http://<phone-ip>:8080 ocr photo.jpg` |
| `fastapi_proxy.py` | A FastAPI app using the phone as its ML backend (`uvicorn fastapi_proxy:app`) |
| `discover.py` | Find phones on the LAN via Bonjour (`_sidecarml._tcp`) |

The chat endpoint is OpenAI-compatible, so the official SDK also works directly:

```python
from openai import OpenAI

phone = OpenAI(base_url="http://<phone-ip>:8080/v1", api_key="unused")
reply = phone.chat.completions.create(
    model="apple-fm",
    messages=[{"role": "user", "content": "Hello from the OpenAI SDK!"}],
)
print(reply.choices[0].message.content)
```

If you enabled auth in the app's Settings, pass the token:
`SidecarClient(url, token="…")` / `api_key="<token>"` with the OpenAI SDK.
