import { useMemo, useState } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ErrorBanner } from './components/Primitives';
import { PANELS } from './panels/registry';
import { useConnection } from './state/ConnectionContext';

export default function App() {
  const { capabilities, status } = useConnection();
  const [selectedId, setSelectedId] = useState('chat');

  const selected = PANELS.find((panel) => panel.id === selectedId) ?? PANELS[0];
  const SelectedComponent = selected.component;

  const capabilityById = useMemo(
    () => new Map(capabilities.map((capability) => [capability.id, capability])),
    [capabilities],
  );
  const selectedCapability = capabilityById.get(selected.capabilityId);

  const groups = useMemo(() => {
    const names: string[] = [];
    for (const panel of PANELS) {
      if (!names.includes(panel.group)) names.push(panel.group);
    }
    return names;
  }, []);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-line p-3">
        <header className="flex items-center gap-2 px-1 pt-1">
          <span className="inline-block size-7 rounded-lg btn-gradient text-center text-sm leading-7">📱</span>
          <div>
            <h1 className="text-sm font-bold leading-tight">Sidecar ML</h1>
            <p className="text-[10px] text-ink-3">iPhone inference console</p>
          </div>
        </header>

        <ConnectionPanel />

        <nav className="flex-1 overflow-y-auto" aria-label="Capabilities">
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-3">
                {group}
              </p>
              <ul>
                {PANELS.filter((panel) => panel.group === group).map((panel) => {
                  const capability = capabilityById.get(panel.capabilityId);
                  const available = capability?.available ?? false;
                  const isSelected = panel.id === selected.id;
                  return (
                    <li key={panel.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(panel.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-panel-2 text-ink'
                            : 'text-ink-2 hover:bg-panel hover:text-ink'
                        }`}
                      >
                        <span className="text-base">{panel.icon}</span>
                        <span className="flex-1">{panel.title}</span>
                        <span
                          title={capability ? (available ? 'Ready' : capability.reason) : 'Unknown'}
                          className={`size-1.5 rounded-full ${
                            status !== 'online'
                              ? 'bg-ink-3/40'
                              : available
                                ? 'bg-mint'
                                : 'bg-amber-a'
                          }`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <p className="px-2 text-[10px] leading-relaxed text-ink-3">
          All inference runs on the iPhone. Keep the Sidecar ML app in the foreground.
        </p>
      </aside>

      {/* Main panel */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-5">
          <header className="flex items-baseline gap-3">
            <h2 className="text-xl font-bold">
              {selected.icon} {selected.title}
            </h2>
            {selectedCapability && (
              <span className="text-xs text-ink-3">{selectedCapability.summary}</span>
            )}
          </header>

          {status === 'online' && selectedCapability && !selectedCapability.available && (
            <ErrorBanner
              message={`Unavailable on this device: ${selectedCapability.reason ?? 'unknown reason'}`}
            />
          )}
          {status !== 'online' && (
            <ErrorBanner message="Not connected — enter your iPhone's address (shown in the Sidecar ML app) and press Connect." />
          )}

          <SelectedComponent key={selected.id} />
        </div>
      </main>
    </div>
  );
}
