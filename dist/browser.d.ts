export declare const HOST_API_VERSION: "1.0";
export declare const NATIVE_SERVICE_HOST_API_VERSION: "2.0";
export declare const DEFAULT_MAX_MESSAGE_BYTES: number;
export declare const NATIVE_SERVICE_MAX_MESSAGE_BYTES: number;
export type HostApiVersion = typeof HOST_API_VERSION | typeof NATIVE_SERVICE_HOST_API_VERSION;
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
        data?: {
            code?: string;
            [key: string]: unknown;
        };
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
export interface HostAppActivateRequest {
    appId: string;
    payload?: unknown;
}
export interface HostAppActivateResult {
    accepted: true;
    activationId: string;
}
export interface HostAppActivatedNotification {
    activationId: string;
    sourceAppId: string;
    payload?: unknown;
}
export declare class HostRpcError extends Error {
    readonly code: string;
    readonly rpcCode?: number;
    constructor(code: string, message: string, rpcCode?: number);
}
export interface PluginClient {
    handshake(): Promise<HostHandshake>;
    call<T>(method: string, params?: unknown, options?: {
        signal?: AbortSignal;
    }): Promise<T>;
    onThemeChange(listener: (theme: 'dark' | 'light') => void): () => void;
    onNotification(method: string, listener: (params: unknown) => void): () => void;
    close(): void;
}
export declare function createPluginClient(port: MessagePortLike, options: {
    appId: string;
    apiVersion?: HostApiVersion;
    timeoutMs?: number;
    maxMessageBytes?: number;
}): PluginClient;
export declare function connectPlugin(appId: string, options?: {
    apiVersion?: HostApiVersion;
    timeoutMs?: number;
    maxMessageBytes?: number;
    targetWindow?: Window;
}): Promise<PluginClient>;
