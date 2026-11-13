export declare const HOST_API_VERSION: "1.0";
export declare const DEFAULT_MAX_MESSAGE_BYTES: number;
export interface RpcRequest {
    jsonrpc: '2.0';
    id: string;
    apiVersion: typeof HOST_API_VERSION;
    appId: string;
    method: string;
    params: unknown;
}
export interface RpcNotification {
    jsonrpc: '2.0';
    apiVersion: typeof HOST_API_VERSION;
    appId: string;
    method: string;
    params: unknown;
}
export interface RpcSuccess {
    jsonrpc: '2.0';
    id: string;
    apiVersion: typeof HOST_API_VERSION;
    appId: string;
    result: unknown;
}
export interface RpcFailure {
    jsonrpc: '2.0';
    id: string;
    apiVersion: typeof HOST_API_VERSION;
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
    apiVersion: typeof HOST_API_VERSION;
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
    close(): void;
}
export declare function createPluginClient(port: MessagePortLike, options: {
    appId: string;
    timeoutMs?: number;
    maxMessageBytes?: number;
}): PluginClient;
export declare function connectPlugin(appId: string, options?: {
    timeoutMs?: number;
    maxMessageBytes?: number;
    targetWindow?: Window;
}): Promise<PluginClient>;
