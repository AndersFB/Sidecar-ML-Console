import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, joinUrl, ApiError, type ApiConfig } from '../api/client';
import type { Capability, Health } from '../api/types';
import { log } from '../utils/log';
import { usePersistentState } from '../utils/usePersistentState';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline';

interface ConnectionState {
  baseUrl: string;
  token: string;
  status: ConnectionStatus;
  health: Health | null;
  capabilities: Capability[];
  error: string | null;
  config: ApiConfig;
  /**
   * Config snapshot from the last successful connect; null while disconnected.
   * Use this (not `config`, which tracks the address field live) for fetches
   * that should only re-run after an actual reconnect.
   */
  connectedConfig: ApiConfig | null;
  /** Successfully connected addresses, most recent first. */
  recentUrls: string[];
  setBaseUrl: (url: string) => void;
  setToken: (token: string) => void;
  connect: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionState | null>(null);

const STORAGE_URL = 'sidecar.baseUrl';
const STORAGE_TOKEN = 'sidecar.token';

/** Pre-flight warnings for configurations that can never reach a phone. */
function logConnectPreflight(baseUrl: string) {
  log.info(`connecting to ${baseUrl} (console page origin: ${window.location.origin})`);
  if (window.location.protocol === 'https:' && baseUrl.startsWith('http:')) {
    log.warn(
      'Mixed content: this page is served over https:// but the phone address is http:// — browsers silently block such requests. Open the console over http:// (e.g. the npm run dev URL) or from a downloaded file instead.',
    );
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(baseUrl)) {
    log.warn(
      `${baseUrl} points at THIS computer, not the phone. Enter the address shown on the phone's Connect card (something like http://192.168.1.x:8080).`,
    );
  }
}

/** Explains a failed connect attempt in the console with concrete next steps. */
function logConnectFailure(baseUrl: string, err: unknown) {
  if (err instanceof ApiError) {
    log.error(
      `the phone responded, but with an error: HTTP ${err.status} [${err.code}] ${err.message} — network path is fine.`,
    );
    if (err.status === 401) {
      log.warn(
        'Auth is enabled on the phone — click "token" above the address field and paste the bearer token from the phone\'s Settings tab.',
      );
    }
    return;
  }
  log.error('network-level failure — the request never reached the phone (or the browser blocked it):', err);
  log.warn(
    [
      'Checklist:',
      `  1. Phone and this computer on the same Wi-Fi? What you typed (${baseUrl}) must exactly match the phone's Connect card.`,
      '  2. Is the Sidecar ML app open in the FOREGROUND with the server running? iOS closes the server when the app is backgrounded or the phone locks.',
      `  3. Open ${joinUrl(baseUrl, '/health')} directly in a new browser tab. JSON there means the network is fine and the browser is blocking this page (check the address bar / site settings for a "local network" permission). No response means wrong IP, different network, or router AP-isolation.`,
      '  4. On the phone: Settings → Privacy & Security → Local Network → Sidecar ML must be ON.',
      "  5. If the phone shows an address on interface pdp_ip0 (cellular) instead of en0 (Wi-Fi), it isn't reachable from this computer — turn the phone's Wi-Fi on.",
    ].join('\n'),
  );
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState(
    () => localStorage.getItem(STORAGE_URL) ?? 'http://127.0.0.1:8080',
  );
  const [token, setTokenState] = useState(() => localStorage.getItem(STORAGE_TOKEN) ?? '');
  const [recentUrls, setRecentUrls] = usePersistentState<string[]>('sidecar.recentUrls', []);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [connectedConfig, setConnectedConfig] = useState<ApiConfig | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [error, setError] = useState<string | null>(null);

  const config = useMemo<ApiConfig>(
    () => ({ baseUrl, token: token || undefined }),
    [baseUrl, token],
  );

  const setBaseUrl = useCallback((url: string) => {
    setBaseUrlState(url);
    localStorage.setItem(STORAGE_URL, url);
  }, []);

  const setToken = useCallback((value: string) => {
    setTokenState(value);
    localStorage.setItem(STORAGE_TOKEN, value);
  }, []);

  // Attempts can overlap (auto-connect to a dead address timing out long after
  // a manual connect succeeded) — only the newest attempt may write state.
  const attemptRef = useRef(0);

  const connect = useCallback(async () => {
    const attempt = ++attemptRef.current;
    setStatus('connecting');
    setError(null);
    logConnectPreflight(config.baseUrl);
    try {
      const healthResult = await api.health(config);
      const caps = await api.capabilities(config);
      if (attempt !== attemptRef.current) return;
      setHealth(healthResult);
      setCapabilities(caps);
      setStatus('online');
      setConnectedConfig(config);
      setRecentUrls((current) =>
        [config.baseUrl, ...current.filter((url) => url !== config.baseUrl)].slice(0, 5),
      );
      log.info(
        `connected: ${healthResult.app} ${healthResult.version} — up ${healthResult.uptime_s}s, ${caps.length} capabilities (${caps.filter((c) => c.available).length} available)`,
      );
    } catch (err) {
      if (attempt !== attemptRef.current) return;
      setHealth(null);
      setCapabilities([]);
      setStatus('offline');
      setConnectedConfig(null);
      setError(err instanceof Error ? err.message : String(err));
      logConnectFailure(config.baseUrl, err);
    }
  }, [config, setRecentUrls]);

  // Try the saved address once on mount.
  useEffect(() => {
    void connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      baseUrl,
      token,
      status,
      health,
      capabilities,
      error,
      config,
      connectedConfig,
      recentUrls,
      setBaseUrl,
      setToken,
      connect,
    }),
    [baseUrl, token, status, health, capabilities, error, config, connectedConfig, recentUrls, setBaseUrl, setToken, connect],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionState {
  const context = useContext(ConnectionContext);
  if (!context) throw new Error('useConnection must be used inside ConnectionProvider');
  return context;
}
