export type ProviderKind = "PREFEITURA" | "ENERGIA" | "INTERNET" | "OTHER";

export type ProviderSession = {
  /** Playwright storageState or cookie jar */
  storageState?: unknown;
  /** Opaque tokens captured from the provider */
  tokens?: Record<string, string>;
  /** Extra metadata */
  meta?: Record<string, unknown>;
};

export type SyncItem = {
  externalId: string;
  year?: number;
  digit?: string;
  title?: string;
  status?: string;
  payload?: Record<string, unknown>;
};

export type ConnectInput = {
  login: string;
  password: string;
  cityOrEntity?: string;
  /** Optional override for generic portals (energia/internet custom) */
  portalUrl?: string;
};

export type ConnectResult = {
  ok: boolean;
  message: string;
  session?: ProviderSession;
  displayName?: string;
  cityOrEntity?: string;
};

export type SyncResult = {
  ok: boolean;
  message: string;
  items: SyncItem[];
  needsReconnect?: boolean;
};

export type ProviderEntity = {
  id: string;
  label: string;
  portalUrl?: string;
};

export interface ProviderAdapter {
  key: string;
  kind: ProviderKind;
  name: string;
  description: string;
  /** Cities/entities available for this provider (optional) */
  entities?: ProviderEntity[];
  connect(input: ConnectInput): Promise<ConnectResult>;
  sync(session: ProviderSession): Promise<SyncResult>;
}
