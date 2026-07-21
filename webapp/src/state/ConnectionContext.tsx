import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type ApiConfig } from '../api/client';
import type { Capability, Health } from '../api/types';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline';

interface ConnectionState {
  baseUrl: string;
  token: string;
  status: ConnectionStatus;
  health: Health | null;
  capabilities: Capability[];
  error: string | null;
  config: ApiConfig;
  setBaseUrl: (url: string) => void;
  setToken: (token: string) => void;
  connect: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionState | null>(null);

const STORAGE_URL = 'sidecar.baseUrl';
const STORAGE_TOKEN = 'sidecar.token';

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState(
    () => localStorage.getItem(STORAGE_URL) ?? 'http://127.0.0.1:8080',
  );
  const [token, setTokenState] = useState(() => localStorage.getItem(STORAGE_TOKEN) ?? '');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
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

  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    try {
      const healthResult = await api.health(config);
      const caps = await api.capabilities(config);
      setHealth(healthResult);
      setCapabilities(caps);
      setStatus('online');
    } catch (err) {
      setHealth(null);
      setCapabilities([]);
      setStatus('offline');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [config]);

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
      setBaseUrl,
      setToken,
      connect,
    }),
    [baseUrl, token, status, health, capabilities, error, config, setBaseUrl, setToken, connect],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionState {
  const context = useContext(ConnectionContext);
  if (!context) throw new Error('useConnection must be used inside ConnectionProvider');
  return context;
}
