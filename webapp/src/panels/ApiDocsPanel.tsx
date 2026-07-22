import { useMemo, useState } from 'react';
import { Card, CopyButton, inputClass } from '../components/Primitives';
import { API_REFERENCE, type EndpointDoc } from '../docs/apiReference';
import { useConnection } from '../state/ConnectionContext';

const FALLBACK_BASE = 'http://<phone-ip>:8080';

function CodeBlock({ label, code }: { label?: string; code: string }) {
  return (
    <div className="min-w-0">
      {label && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-3">
            {label}
          </span>
          <CopyButton text={code} />
        </div>
      )}
      <pre className="overflow-x-auto rounded-xl bg-navy/80 p-3 font-mono text-xs leading-relaxed text-ink-2">
        {code}
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: EndpointDoc['method'] }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
        method === 'GET' ? 'bg-mint/15 text-mint' : 'bg-cyan-a/15 text-cyan-a'
      }`}
    >
      {method}
    </span>
  );
}

function EndpointCard({ endpoint, base }: { endpoint: EndpointDoc; base: string }) {
  const substitute = (text: string) => text.replaceAll('{{BASE}}', base);
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={endpoint.method} />
          <code className="break-all font-mono text-sm font-semibold text-ink">
            {endpoint.path}
          </code>
          <span className="flex-1" />
          {endpoint.noAuth && (
            <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-3">
              no auth
            </span>
          )}
          <CopyButton text={`${base}${endpoint.path}`} />
        </div>

        <p className="text-sm leading-relaxed text-ink-2">{endpoint.summary}</p>

        {endpoint.params && (
          <dl className="flex flex-col gap-1">
            {endpoint.params.map((param) => (
              <div key={param.name} className="flex gap-2 text-xs leading-relaxed">
                <dt className="shrink-0 font-mono text-cyan-a">{param.name}</dt>
                <dd className="text-ink-2">{param.note}</dd>
              </div>
            ))}
          </dl>
        )}

        {endpoint.response && <CodeBlock label="Response" code={endpoint.response} />}
        {endpoint.curl && <CodeBlock label="curl" code={substitute(endpoint.curl)} />}
        {endpoint.python && <CodeBlock label="Python" code={substitute(endpoint.python)} />}
      </div>
    </Card>
  );
}

export function ApiDocsPanel() {
  const { status, connectedConfig } = useConnection();
  const [filter, setFilter] = useState('');

  const base =
    status === 'online' && connectedConfig
      ? connectedConfig.baseUrl.replace(/\/+$/, '')
      : FALLBACK_BASE;

  const groups = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return API_REFERENCE;
    return API_REFERENCE.map((group) => ({
      ...group,
      endpoints: group.endpoints.filter(
        (endpoint) =>
          endpoint.path.toLowerCase().includes(query) ||
          endpoint.summary.toLowerCase().includes(query) ||
          group.title.toLowerCase().includes(query),
      ),
    })).filter((group) => group.endpoints.length > 0);
  }, [filter]);

  const endpointCount = API_REFERENCE.reduce((sum, group) => sum + group.endpoints.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Using the API">
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
          <p>
            Base URL: <code className="font-mono text-cyan-a">{base}</code>
            {status === 'online' ? (
              <span className="text-ink-3"> (your connected phone)</span>
            ) : (
              <span className="text-ink-3"> (shown in the Sidecar ML app; connect to fill in)</span>
            )}
            . Everything is JSON with <code className="font-mono">snake_case</code> keys.
          </p>
          <p>
            If auth is enabled in the app, send{' '}
            <code className="font-mono">Authorization: Bearer &lt;token&gt;</code> on every request
            except <code className="font-mono">GET /</code> and{' '}
            <code className="font-mono">GET /health</code>. Errors are always{' '}
            <code className="font-mono">{'{"error": {"code", "message", "type"}}'}</code>; a
            capability the device cannot run answers 503 with a human-readable reason. CORS is fully
            open, so browser apps can call the phone directly.
          </p>
          <p>
            Binary inputs (images / audio) are accepted as a raw request body with a content type,
            or as JSON <code className="font-mono">image_base64</code> /{' '}
            <code className="font-mono">audio_base64</code> — no multipart. Binary outputs default
            to a JSON envelope; send <code className="font-mono">Accept: image/png</code> (or{' '}
            <code className="font-mono">audio/wav</code>) for raw bytes.
          </p>
          <p className="text-xs text-ink-3">
            Python snippets use the ready-made client from{' '}
            <a
              className="text-cyan-a underline decoration-cyan-a/40 hover:decoration-cyan-a"
              href="https://github.com/AndersFB/Sidecar-ML-Console/tree/main/examples/python"
              target="_blank"
              rel="noreferrer"
            >
              examples/python
            </a>{' '}
            (<code className="font-mono">phone = SidecarClient("{base}")</code>). The chat endpoint
            is OpenAI-compatible, so the official SDKs work too.
          </p>
        </div>
      </Card>

      <input
        className={`${inputClass} w-full`}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder={`Filter ${endpointCount} endpoints — try "ocr", "chat", "translate"…`}
        aria-label="Filter endpoints"
      />

      {groups.length === 0 && (
        <p className="text-sm text-ink-3">No endpoints match “{filter.trim()}”.</p>
      )}

      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-widest text-ink-3">
            {group.title}
          </h3>
          {group.note && (
            <p className="text-xs leading-relaxed text-ink-3">
              {group.note.replaceAll('{{BASE}}', base)}
            </p>
          )}
          {group.endpoints.map((endpoint) => (
            <EndpointCard key={`${endpoint.method} ${endpoint.path}`} endpoint={endpoint} base={base} />
          ))}
        </section>
      ))}
    </div>
  );
}
