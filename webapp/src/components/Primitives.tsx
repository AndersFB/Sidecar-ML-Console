import { useState, type ReactNode } from 'react';

export function Card({ title, children, actions }: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="card p-4">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-ink-2">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'btn-gradient px-4 py-2 text-sm disabled:opacity-40',
    ghost:
      'rounded-lg border border-line bg-panel-2 px-4 py-2 text-sm text-ink hover:border-cyan-a/40 disabled:opacity-40',
    danger:
      'rounded-lg border border-coral/40 bg-coral/10 px-4 py-2 text-sm text-coral disabled:opacity-40',
  } as const;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={styles[variant]}>
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-2" role="status">
      <span className="inline-block size-4 animate-spin rounded-full border-2 border-cyan-a border-t-transparent" />
      {label ?? 'Working…'}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-a/30 bg-amber-a/10 px-4 py-3 text-sm text-amber-a"
    >
      {message}
    </div>
  );
}

export function JsonViewer({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-xl bg-navy/80 p-3 font-mono text-xs leading-relaxed text-ink-2">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:text-cyan-a"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-2">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  'rounded-lg border border-line bg-navy/70 px-3 py-2 text-sm text-ink outline-none focus:border-cyan-a/60';
