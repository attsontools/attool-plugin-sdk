export { NATIVE_SERVICE_PERMISSIONS, P0_PERMISSIONS, PLUGIN_PERMISSIONS } from './permissions.ts';
export type PluginTargetOs = 'macos' | 'windows' | 'linux';
export type PluginTargetArch = 'aarch64' | 'x86_64';
export interface PluginManifest {
    schemaVersion: 1;
    appId: string;
    name: string;
    version: string;
    publisher: {
        id: string;
        name: string;
        keyId: string;
    };
    target: {
        os: PluginTargetOs;
        arch: PluginTargetArch;
    };
    hostApi: {
        min: string;
        max: string;
    };
    ui: {
        entry: string;
    };
    permissions: string[];
    nativeService?: {
        entry: string;
        version: string;
        sha256: string;
        protocolVersion: 1;
    };
    files: Record<string, string>;
}
export type ManifestErrorCode = 'MANIFEST_INVALID' | 'MANIFEST_SCHEMA_UNSUPPORTED' | 'MANIFEST_APP_ID_INVALID' | 'MANIFEST_VERSION_INVALID' | 'MANIFEST_PUBLISHER_INVALID' | 'MANIFEST_TARGET_INVALID' | 'MANIFEST_HOST_API_UNSUPPORTED' | 'MANIFEST_ENTRY_MISSING' | 'MANIFEST_FILE_PATH_INVALID' | 'MANIFEST_FILE_HASH_INVALID' | 'MANIFEST_PERMISSION_UNKNOWN' | 'MANIFEST_NATIVE_SERVICE_INVALID' | 'MANIFEST_NATIVE_SERVICE_REQUIRED';
export declare class ManifestValidationError extends Error {
    readonly code: ManifestErrorCode;
    constructor(code: ManifestErrorCode, message: string);
}
export declare function parseManifest(value: unknown): PluginManifest;
export declare function canonicalManifest(manifest: PluginManifest): string;
export * from './catalog.ts';
