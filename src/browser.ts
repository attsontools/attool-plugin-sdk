export const HOST_API_VERSION = '1.0' as const;
export const NATIVE_SERVICE_HOST_API_VERSION = '2.0' as const;
export const DEFAULT_MAX_MESSAGE_BYTES = 1024 * 1024;
export const NATIVE_SERVICE_MAX_MESSAGE_BYTES = 8 * 1024 * 1024;

export type HostApiVersion =
  | typeof HOST_API_VERSION
  | typeof NATIVE_SERVICE_HOST_API_VERSION;

export interface RpcRequest {
  jsonrpc: '2.0';
  id: string;
  apiVersion: HostApiVersion;
  appId: string;
  method: string;
  params: unknown;
}

export interface RpcNotification {
  jsonrpc: '2.0';
  apiVersion: HostApiVersion;
  appId: string;
  method: string;
  params: unknown;
}

export interface RpcSuccess {
  jsonrpc: '2.0';
  id: string;
  apiVersion: HostApiVersion;
  appId: string;
  result: unknown;
}

export interface RpcFailure {
  jsonrpc: '2.0';
  id: string;
  apiVersion: HostApiVersion;
  appId: string;
  error: {
    code: number;
    message: string;
    data?: { code?: string; [key: string]: unknown };
  };
}

export type RpcMessage = RpcRequest | RpcNotification | RpcSuccess | RpcFailure;

export interface MessagePortLike {
  onmessage: ((event: MessageEvent<RpcMessage>) => void) | null;
  postMessage(message: RpcMessage): void;
  start(): void;
  close(): void;
}

export interface HostHandshake {
  apiVersion: HostApiVersion;
  sessionId: string;
  correlationId: string;
  capabilities: string[];
  metadata: {
    appId: string;
    name: string;
    version: string;
  };
  theme: 'dark' | 'light';
}

export interface HostUiOpenRequest {
  windowId: string;
  payload?: unknown;
}

export interface HostUiActivatedNotification {
  windowId: string;
  payload?: unknown;
}

export interface HostUiCloseResult {
  closed: true;
}

export class HostRpcError extends Error {
  readonly code: string;
  readonly rpcCode?: number;

  constructor(code: string, message: string, rpcCode?: number) {
    super(message);
    this.name = 'HostRpcError';
    this.code = code;
    this.rpcCode = rpcCode;
  }
}

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: HostRpcError): void;
  timer: ReturnType<typeof setTimeout>;
  removeAbort?: () => void;
};

export interface PluginClient {
  handshake(): Promise<HostHandshake>;
  call<T>(method: string, params?: unknown, options?: { signal?: AbortSignal }): Promise<T>;
  onThemeChange(listener: (theme: 'dark' | 'light') => void): () => void;
  onNotification(method: string, listener: (params: unknown) => void): () => void;
  close(): void;
}

export function createPluginClient(
  port: MessagePortLike,
  options: {
    appId: string;
    apiVersion?: HostApiVersion;
    timeoutMs?: number;
    maxMessageBytes?: number;
  }
): PluginClient {
  const apiVersion = options.apiVersion ?? HOST_API_VERSION;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxMessageBytes = options.maxMessageBytes
    ?? (apiVersion === NATIVE_SERVICE_HOST_API_VERSION
      ? NATIVE_SERVICE_MAX_MESSAGE_BYTES
      : DEFAULT_MAX_MESSAGE_BYTES);
  const pending = new Map<string, PendingRequest>();
  const themeListeners = new Set<(theme: 'dark' | 'light') => void>();
  const notificationListeners = new Map<string, Set<(params: unknown) => void>>();
  let nextId = 1;
  let closed = false;

  function send(message: RpcMessage) {
    const bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength;
    if (bytes > maxMessageBytes) {
      throw new HostRpcError('HOST_MESSAGE_TOO_LARGE', 'Host API message is too large');
    }
    port.postMessage(message);
  }

  function notify(method: string, params: unknown) {
    send({
      jsonrpc: '2.0',
      apiVersion,
      appId: options.appId,
      method,
      params
    });
  }

  async function call<T>(
    method: string,
    params: unknown = {},
    callOptions: { signal?: AbortSignal } = {}
  ): Promise<T> {
    if (closed) throw new HostRpcError('HOST_SESSION_CLOSED', 'Host API session is closed');
    if (callOptions.signal?.aborted) {
      throw new HostRpcError('HOST_REQUEST_CANCELLED', 'Host API request was cancelled');
    }
    const id = String(nextId++);
    return new Promise<T>((resolve, reject) => {
      const cancel = (code: string, message: string) => {
        const active = pending.get(id);
        if (!active) return;
        pending.delete(id);
        clearTimeout(active.timer);
        active.removeAbort?.();
        try {
          notify('$/cancelRequest', { id });
        } catch {
          // The original cancellation error remains authoritative.
        }
        reject(new HostRpcError(code, message));
      };
      const timer = setTimeout(
        () => cancel('HOST_TIMEOUT', `Host API request timed out: ${method}`),
        timeoutMs
      );
      let removeAbort: (() => void) | undefined;
      if (callOptions.signal) {
        const onAbort = () =>
          cancel('HOST_REQUEST_CANCELLED', `Host API request was cancelled: ${method}`);
        callOptions.signal.addEventListener('abort', onAbort, { once: true });
        removeAbort = () => callOptions.signal?.removeEventListener('abort', onAbort);
      }
      pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        removeAbort
      });
      try {
        send({
          jsonrpc: '2.0',
          id,
          apiVersion,
          appId: options.appId,
          method,
          params
        });
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        removeAbort?.();
        reject(
          error instanceof HostRpcError
            ? error
            : new HostRpcError('HOST_SEND_FAILED', String(error))
        );
      }
    });
  }

  port.onmessage = (event) => {
    const message = event.data;
    let bytes = 0;
    try {
      bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength;
    } catch {
      return;
    }
    if (
      bytes > maxMessageBytes ||
      message.jsonrpc !== '2.0' ||
      message.apiVersion !== apiVersion ||
      message.appId !== options.appId
    ) {
      return;
    }
    if ('id' in message && ('result' in message || 'error' in message)) {
      const active = pending.get(message.id);
      if (!active) return;
      pending.delete(message.id);
      clearTimeout(active.timer);
      active.removeAbort?.();
      if ('error' in message) {
        active.reject(
          new HostRpcError(
            message.error.data?.code ?? 'HOST_RPC_ERROR',
            message.error.message,
            message.error.code
          )
        );
      } else {
        active.resolve(message.result);
      }
      return;
    }
    if (message.method === 'host.theme.changed') {
      const theme = (message.params as { theme?: unknown })?.theme;
      if (theme === 'dark' || theme === 'light') {
        for (const listener of themeListeners) listener(theme);
      }
    }
    if ('method' in message) {
      for (const listener of notificationListeners.get(message.method) ?? []) {
        listener(message.params);
      }
    }
  };
  port.start();

  return {
    handshake: async () => validateHandshake(
      await call<unknown>('host.handshake'),
      options.appId,
      apiVersion
    ),
    call,
    onThemeChange(listener) {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
    onNotification(method, listener) {
      const listeners = notificationListeners.get(method) ?? new Set<(params: unknown) => void>();
      listeners.add(listener);
      notificationListeners.set(method, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) notificationListeners.delete(method);
      };
    },
    close() {
      if (closed) return;
      closed = true;
      port.onmessage = null;
      port.close();
      for (const active of pending.values()) {
        clearTimeout(active.timer);
        active.removeAbort?.();
        active.reject(new HostRpcError('HOST_SESSION_CLOSED', 'Host API session is closed'));
      }
      pending.clear();
      themeListeners.clear();
      notificationListeners.clear();
    }
  };
}

function validateHandshake(
  value: unknown,
  appId: string,
  apiVersion: HostApiVersion
): HostHandshake {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HostRpcError('HOST_HANDSHAKE_INVALID', 'Host handshake response is invalid');
  }
  const handshake = value as Partial<HostHandshake>;
  const metadata = handshake.metadata;
  if (
    handshake.apiVersion !== apiVersion ||
    typeof handshake.sessionId !== 'string' ||
    handshake.sessionId.length === 0 ||
    typeof handshake.correlationId !== 'string' ||
    handshake.correlationId.length === 0 ||
    !Array.isArray(handshake.capabilities) ||
    handshake.capabilities.some((capability) => typeof capability !== 'string') ||
    (handshake.theme !== 'dark' && handshake.theme !== 'light') ||
    typeof metadata !== 'object' ||
    metadata === null ||
    metadata.appId !== appId ||
    typeof metadata.name !== 'string' ||
    typeof metadata.version !== 'string'
  ) {
    throw new HostRpcError('HOST_HANDSHAKE_INVALID', 'Host handshake response is invalid');
  }
  return handshake as HostHandshake;
}

export async function connectPlugin(
  appId: string,
  options: {
    apiVersion?: HostApiVersion;
    timeoutMs?: number;
    maxMessageBytes?: number;
    targetWindow?: Window;
  } = {}
): Promise<PluginClient> {
  const targetWindow = options.targetWindow ?? window;
  const apiVersion = options.apiVersion ?? HOST_API_VERSION;
  const timeoutMs = options.timeoutMs ?? 10_000;
  return new Promise<PluginClient>((resolve, reject) => {
    const timer = setTimeout(() => {
      targetWindow.removeEventListener('message', onMessage);
      reject(new HostRpcError('HOST_CONNECT_TIMEOUT', 'Host connection timed out'));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; appId?: unknown; apiVersion?: unknown };
      if (
        event.source !== targetWindow.parent ||
        data?.type !== 'attool:connect' ||
        data.appId !== appId ||
        data.apiVersion !== apiVersion ||
        !event.ports[0]
      ) {
        return;
      }
      clearTimeout(timer);
      targetWindow.removeEventListener('message', onMessage);
      resolve(
        createPluginClient(event.ports[0], {
          appId,
          apiVersion,
          timeoutMs,
          maxMessageBytes: options.maxMessageBytes
        })
      );
    };
    targetWindow.addEventListener('message', onMessage);
  });
}
