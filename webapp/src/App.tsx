import { useMemo, useState } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { Icon } from './components/Icon';
import { SidecarLogo } from './components/SidecarLogo';
import { ErrorBanner } from './components/Primitives';
import { PANELS } from './panels/registry';
import { useConnection } from './state/ConnectionContext';
import { usePersistentState } from './utils/usePersistentState';

export default function App() {
  const { capabilities, status } = useConnection();
  const [selectedId, setSelectedId] = usePersistentState('sidecar.panel', 'chat');

  const selected = PANELS.find((panel) => panel.id === selectedId) ?? PANELS[0];
  // Visited panels stay mounted (hidden) so their input/result survive switching.
  const [visited, setVisited] = useState<string[]>(() => [selected.id]);

  const selectPanel = (id: string) => {
    setSelectedId(id);
    setVisited((current) => (current.includes(id) ? current : [...current, id]));
  };

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
    <div className="flex h-full max-md:flex-col">
      {/* Sidebar (top bar on small screens) */}
      <aside className="flex flex-col gap-3 border-line p-3 max-md:border-b md:w-72 md:shrink-0 md:border-r">
        <header className="flex items-center gap-2 px-1 pt-1">
          <SidecarLogo size={30} />
          <div>
            <h1 className="text-sm font-bold leading-tight">Sidecar ML</h1>
            <p className="text-[10px] text-ink-3">iPhone inference console</p>
          </div>
        </header>

        <ConnectionPanel />

        <nav
          className="max-md:-mx-3 max-md:flex max-md:gap-4 max-md:overflow-x-auto max-md:px-3 md:flex-1 md:overflow-y-auto"
          aria-label="Capabilities"
        >
          {groups.map((group) => (
            <div key={group} className="max-md:shrink-0 md:mb-3">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-3 max-md:hidden">
                {group}
              </p>
              <ul className="max-md:flex max-md:gap-1">
                {PANELS.filter((panel) => panel.group === group).map((panel) => {
                  const capability = capabilityById.get(panel.capabilityId);
                  const available = capability?.available ?? false;
                  const isSelected = panel.id === selected.id;
                  return (
                    <li key={panel.id} className="max-md:shrink-0">
                      <button
                        type="button"
                        onClick={() => selectPanel(panel.id)}
                        className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-panel-2 text-ink'
                            : 'text-ink-2 hover:bg-panel hover:text-ink'
                        }`}
                      >
                        <Icon
                          name={panel.icon}
                          size={17}
                          className={isSelected ? 'text-cyan-a' : 'text-ink-3'}
                        />
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

        <p className="px-2 text-[10px] leading-relaxed text-ink-3 max-md:hidden">
          All inference runs on the iPhone. Keep the Sidecar ML app in the foreground.
        </p>
      </aside>

      {/* Main panel */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-5">
          <header className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-panel text-cyan-a">
              <Icon name={selected.icon} size={20} />
            </span>
            <h2 className="text-xl font-bold">{selected.title}</h2>
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

          {PANELS.filter((panel) => visited.includes(panel.id)).map((panel) => (
            <div key={panel.id} hidden={panel.id !== selected.id}>
              <panel.component />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
