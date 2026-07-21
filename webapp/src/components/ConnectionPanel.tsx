import { useState, type FormEvent } from 'react';
import { useConnection } from '../state/ConnectionContext';
import { inputClass } from './Primitives';

const STATUS_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  idle: { dot: 'bg-ink-3', text: 'text-ink-3', label: 'Not connected' },
  connecting: { dot: 'bg-amber-a animate-pulse', text: 'text-amber-a', label: 'Connecting…' },
  online: { dot: 'bg-mint', text: 'text-mint', label: 'Online' },
  offline: { dot: 'bg-coral', text: 'text-coral', label: 'Offline' },
};

export function ConnectionPanel() {
  const { baseUrl, token, status, health, error, setBaseUrl, setToken, connect } = useConnection();
  const [showToken, setShowToken] = useState(false);
  const style = STATUS_STYLE[status];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void connect();
  };

  return (
    <form onSubmit={submit} className="card flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-2 text-xs font-medium ${style.text}`}>
          <span className={`size-2 rounded-full ${style.dot}`} />
          {style.label}
          {health && status === 'online' && (
            <span className="text-ink-3">· {health.app} {health.version}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setShowToken((value) => !value)}
          className="text-xs text-ink-3 hover:text-cyan-a"
        >
          {showToken ? 'hide token' : 'token'}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          className={`${inputClass} min-w-0 flex-1 font-mono text-xs`}
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="http://192.168.1.20:8080"
          aria-label="Server address"
        />
        <button type="submit" className="btn-gradient shrink-0 px-3 py-1.5 text-xs">
          Connect
        </button>
      </div>

      {showToken && (
        <input
          className={`${inputClass} font-mono text-xs`}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Bearer token (only if auth is enabled on the phone)"
          aria-label="Bearer token"
        />
      )}

      {status === 'offline' && error && (
        <p className="text-xs text-coral">
          {error} — is the Sidecar ML app open with the server running?
        </p>
      )}
    </form>
  );
}
