/**
 * Shared controls for the voice and face changers.
 *
 * Both effects are "pick a preset, then nudge the sliders", and both take their
 * bounds from the limits the server clamps to (`VOICE_LIMITS`, `FACE_LIMITS` in
 * api/types.ts), so a slider can never ask for a value the phone will reject.
 */

export interface Limits {
  min: number;
  max: number;
  step: number;
}

export function ParameterSlider({
  label,
  value,
  limits,
  onChange,
  resetTo = 0,
  format,
  hint,
}: {
  label: string;
  value: number;
  limits: Limits;
  onChange: (value: number) => void;
  /** Double-click the label to snap back here. */
  resetTo?: number;
  format?: (value: number) => string;
  hint?: string;
}) {
  const shown = format ? format(value) : String(Math.round(value * 100) / 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <button
          type="button"
          onDoubleClick={() => onChange(resetTo)}
          title="Double-click to reset"
          className="text-left text-xs text-ink-2 hover:text-cyan-a"
        >
          {label}
        </button>
        <span className="font-mono text-xs text-ink-3">{shown}</span>
      </div>
      <input
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-cyan-a"
      />
      {hint && <p className="text-[11px] leading-tight text-ink-3">{hint}</p>}
    </div>
  );
}

export function PresetChips({
  presets,
  selected,
  onSelect,
}: {
  presets: { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (presets.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Presets">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          aria-pressed={selected === preset.id}
          onClick={() => onSelect(preset.id)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            selected === preset.id
              ? 'border-cyan-a bg-cyan-a/15 text-cyan-a'
              : 'border-line text-ink-2 hover:border-cyan-a/40 hover:text-cyan-a'
          }`}
        >
          {preset.name}
        </button>
      ))}
    </div>
  );
}

export function ModeTabs<T extends string>({
  modes,
  active,
  onSelect,
}: {
  modes: { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-navy/40 p-1" role="tablist">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={active === mode.id}
          onClick={() => onSelect(mode.id)}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            active === mode.id
              ? 'bg-cyan-a/15 text-cyan-a'
              : 'text-ink-2 hover:text-cyan-a'
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

/** Collapsible group so a panel with fifteen sliders isn't a wall of controls. */
export function ControlGroup({
  title,
  children,
  columns = 2,
}: {
  title: string;
  children: React.ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <details open className="rounded-xl border border-line bg-navy/40 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-ink-2">{title}</summary>
      <div className={`mt-3 grid gap-3 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>{children}</div>
    </details>
  );
}
