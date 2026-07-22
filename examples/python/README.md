# Python examples

Talk to the Sidecar ML iPhone server from Python. CLIs are built with
[typer](https://typer.tiangolo.com), logging with [loguru](https://github.com/Delgan/loguru).
Requires **Python 3.10+**.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

| File | What it shows |
|---|---|
| `client.py` | A typed `SidecarClient` wrapping every endpoint, with loguru request logging |
| `demo.py` | Typer CLI with a command for every endpoint — `python demo.py --help` |
| `fastapi_proxy.py` | FastAPI mirror of the **full** phone API with a Swagger UI (`/docs`) |
| `discover.py` | Find phones on the LAN via Bonjour (`_sidecarml._tcp`) |

```bash
# CLI — address via flag or SIDECAR_URL env; -q hides request logs
python demo.py --base-url http://<phone-ip>:8080 capabilities
python demo.py ocr photo.jpg
python demo.py translate "Good morning" --target de

# FastAPI proxy — every phone endpoint, interactive docs at /docs
SIDECAR_URL=http://<phone-ip>:8080 uvicorn fastapi_proxy:app --reload
open http://127.0.0.1:8000/docs
```

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
`SidecarClient(url, token="…")`, `--token`/`SIDECAR_TOKEN` for the CLIs,
or `api_key="<token>"` with the OpenAI SDK.

`client.py` logs every request through loguru; silence it from your own code
with `from loguru import logger; logger.disable("client")`.
