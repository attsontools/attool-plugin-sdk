export type CatalogKeyStatus = 'active' | 'retired' | 'revoked';
export interface CatalogTrustKey {
    keyId: string;
    algorithm: 'ed25519';
    publicKey: string;
    status: CatalogKeyStatus;
    notBefore: string;
    notAfter: string;
}
export interface CatalogPublisher {
    publisherId: string;
    name: string;
    keys: CatalogTrustKey[];
}
export interface CatalogTrustRoot {
    schemaVersion: 1;
    sequence: number;
    issuedAt: string;
    expiresAt: string;
    catalogKeys: CatalogTrustKey[];
    publishers: CatalogPublisher[];
}
export type CatalogTargetOs = 'macos' | 'windows' | 'linux';
export type CatalogTargetArch = 'aarch64' | 'x86_64';
export interface CatalogArtifact {
    os: CatalogTargetOs;
    arch: CatalogTargetArch;
    url: string;
    fileName: string;
    size: number;
    sha256: string;
}
export interface CatalogRelease {
    version: string;
    publishedAt: string;
    notes: string;
    publisherKeyId: string;
    hostApi: {
        min: string;
        max: '1.x' | '2.x';
    };
    permissions: string[];
    artifacts: CatalogArtifact[];
}
export interface PluginCatalogApp {
    appId: string;
    name: string;
    description: string;
    publisherId: string;
    icon: string;
    channels: {
        stable: CatalogRelease;
    };
}
export interface PluginCatalog {
    schemaVersion: 1;
    sequence: number;
    generatedAt: string;
    expiresAt: string;
    signingKeyId: string;
    apps: PluginCatalogApp[];
}
export interface CatalogArtifactSelection {
    app: PluginCatalogApp;
    release: CatalogRelease;
    artifact: CatalogArtifact;
}
export type CatalogErrorCode = 'TRUST_ROOT_INVALID' | 'TRUST_ROOT_SCHEMA_UNSUPPORTED' | 'TRUST_ROOT_KEY_INVALID' | 'TRUST_ROOT_DUPLICATE_KEY' | 'TRUST_ROOT_TIME_INVALID' | 'METADATA_SEQUENCE_ROLLBACK' | 'CATALOG_INVALID' | 'CATALOG_SCHEMA_UNSUPPORTED' | 'CATALOG_TIME_INVALID' | 'CATALOG_APP_INVALID' | 'CATALOG_RELEASE_INVALID' | 'CATALOG_ARTIFACT_INVALID' | 'CATALOG_DUPLICATE_TARGET' | 'CATALOG_PERMISSION_UNKNOWN';
export declare class CatalogValidationError extends Error {
    readonly code: CatalogErrorCode;
    constructor(code: CatalogErrorCode, message: string);
}
export declare function parseTrustRoot(value: unknown): CatalogTrustRoot;
export declare function assertMetadataNotRolledBack(metadata: {
    sequence: number;
}, highestAcceptedSequence: number): void;
export declare function canSignWithCatalogKey(key: CatalogTrustKey, signedAt: string): boolean;
export declare function canVerifyWithCatalogKey(key: CatalogTrustKey, signedAt: string): boolean;
export declare function parsePluginCatalog(value: unknown): PluginCatalog;
export declare function selectCatalogArtifact(catalog: PluginCatalog, appId: string, os: CatalogTargetOs, arch: CatalogTargetArch): CatalogArtifactSelection | null;
export type CatalogTrustMetadata = CatalogTrustRoot | PluginCatalog;
export declare function canonicalTrustMetadata(metadata: CatalogTrustMetadata): string;
