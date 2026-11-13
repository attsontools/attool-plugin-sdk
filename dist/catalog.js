import { canonicalJson } from "./canonical.js";
import { NATIVE_SERVICE_PERMISSIONS, PLUGIN_PERMISSIONS } from "./permissions.js";
export class CatalogValidationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'CatalogValidationError';
        this.code = code;
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireExactFields(value, fields, label, code = 'TRUST_ROOT_INVALID') {
    const allowed = new Set(fields);
    const unknown = Object.keys(value).find((field) => !allowed.has(field));
    if (unknown) {
        throw new CatalogValidationError(code, `${label} contains unknown field: ${unknown}`);
    }
}
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ED25519_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
function parseUtcTimestamp(value) {
    if (!ISO_UTC_PATTERN.test(value))
        return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed))
        return null;
    const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
    return new Date(parsed).toISOString() === normalized ? parsed : null;
}
function timestamp(value, label, code = 'TRUST_ROOT_TIME_INVALID') {
    const parsed = parseUtcTimestamp(value);
    if (parsed === null)
        throw new CatalogValidationError(code, `${label} must be valid UTC ISO-8601`);
    return parsed;
}
function parseTrustKey(value, label) {
    if (!isRecord(value)) {
        throw new CatalogValidationError('TRUST_ROOT_INVALID', `${label} must be an object`);
    }
    requireExactFields(value, ['keyId', 'algorithm', 'publicKey', 'status', 'notBefore', 'notAfter'], label);
    if (typeof value.keyId !== 'string' || !value.keyId ||
        value.algorithm !== 'ed25519' ||
        typeof value.publicKey !== 'string' || !ED25519_PUBLIC_KEY_PATTERN.test(value.publicKey) ||
        typeof value.status !== 'string' ||
        !['active', 'retired', 'revoked'].includes(value.status) ||
        typeof value.notBefore !== 'string' ||
        typeof value.notAfter !== 'string') {
        throw new CatalogValidationError(typeof value.publicKey === 'string' && value.publicKey
            ? 'TRUST_ROOT_KEY_INVALID'
            : 'TRUST_ROOT_INVALID', `${label} is invalid`);
    }
    if (timestamp(value.notBefore, `${label}.notBefore`) >= timestamp(value.notAfter, `${label}.notAfter`)) {
        throw new CatalogValidationError('TRUST_ROOT_TIME_INVALID', `${label} must have an increasing validity window`);
    }
    return value;
}
function parsePublisher(value, index) {
    const label = `publishers[${index}]`;
    if (!isRecord(value)) {
        throw new CatalogValidationError('TRUST_ROOT_INVALID', `${label} must be an object`);
    }
    requireExactFields(value, ['publisherId', 'name', 'keys'], label);
    if (typeof value.publisherId !== 'string' || !value.publisherId ||
        typeof value.name !== 'string' || !value.name ||
        !Array.isArray(value.keys) || value.keys.length === 0) {
        throw new CatalogValidationError('TRUST_ROOT_INVALID', `${label} is invalid`);
    }
    return {
        publisherId: value.publisherId,
        name: value.name,
        keys: value.keys.map((key, keyIndex) => parseTrustKey(key, `${label}.keys[${keyIndex}]`))
    };
}
export function parseTrustRoot(value) {
    if (!isRecord(value)) {
        throw new CatalogValidationError('TRUST_ROOT_INVALID', 'Root must be an object');
    }
    requireExactFields(value, ['schemaVersion', 'sequence', 'issuedAt', 'expiresAt', 'catalogKeys', 'publishers'], 'root');
    if (value.schemaVersion !== 1) {
        throw new CatalogValidationError('TRUST_ROOT_SCHEMA_UNSUPPORTED', 'Only Root schema version 1 is supported');
    }
    if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1 ||
        typeof value.issuedAt !== 'string' ||
        typeof value.expiresAt !== 'string' ||
        !Array.isArray(value.catalogKeys) || value.catalogKeys.length === 0 ||
        !Array.isArray(value.publishers) || value.publishers.length === 0) {
        throw new CatalogValidationError('TRUST_ROOT_INVALID', 'Root is invalid');
    }
    if (timestamp(value.issuedAt, 'root.issuedAt') >= timestamp(value.expiresAt, 'root.expiresAt')) {
        throw new CatalogValidationError('TRUST_ROOT_TIME_INVALID', 'Root must have an increasing validity window');
    }
    const catalogKeys = value.catalogKeys.map((key, index) => parseTrustKey(key, `catalogKeys[${index}]`));
    const publishers = value.publishers.map(parsePublisher);
    const keyIds = [...catalogKeys, ...publishers.flatMap((publisher) => publisher.keys)]
        .map((key) => key.keyId);
    if (new Set(keyIds).size !== keyIds.length) {
        throw new CatalogValidationError('TRUST_ROOT_DUPLICATE_KEY', 'Root key IDs must be unique');
    }
    const publisherIds = publishers.map((publisher) => publisher.publisherId);
    if (new Set(publisherIds).size !== publisherIds.length) {
        throw new CatalogValidationError('TRUST_ROOT_INVALID', 'Publisher IDs must be unique');
    }
    return {
        schemaVersion: 1,
        sequence: value.sequence,
        issuedAt: value.issuedAt,
        expiresAt: value.expiresAt,
        catalogKeys,
        publishers
    };
}
export function assertMetadataNotRolledBack(metadata, highestAcceptedSequence) {
    if (metadata.sequence < highestAcceptedSequence) {
        throw new CatalogValidationError('METADATA_SEQUENCE_ROLLBACK', `Metadata sequence ${metadata.sequence} is below ${highestAcceptedSequence}`);
    }
}
function isInsideKeyWindow(key, signedAt) {
    const time = parseUtcTimestamp(signedAt);
    const notBefore = parseUtcTimestamp(key.notBefore);
    const notAfter = parseUtcTimestamp(key.notAfter);
    return (time !== null &&
        notBefore !== null &&
        notAfter !== null &&
        time >= notBefore &&
        time <= notAfter);
}
export function canSignWithCatalogKey(key, signedAt) {
    return key.status === 'active' && isInsideKeyWindow(key, signedAt);
}
export function canVerifyWithCatalogKey(key, signedAt) {
    return key.status !== 'revoked' && isInsideKeyWindow(key, signedAt);
}
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const APP_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CATALOG_PERMISSIONS = new Set(PLUGIN_PERMISSIONS);
const CATALOG_NATIVE_SERVICE_PERMISSIONS = new Set(NATIVE_SERVICE_PERMISSIONS);
function parseArtifact(value, label) {
    if (!isRecord(value)) {
        throw new CatalogValidationError('CATALOG_ARTIFACT_INVALID', `${label} must be an object`);
    }
    requireExactFields(value, ['os', 'arch', 'url', 'fileName', 'size', 'sha256'], label, 'CATALOG_ARTIFACT_INVALID');
    if (typeof value.url !== 'string') {
        throw new CatalogValidationError('CATALOG_ARTIFACT_INVALID', `${label}.url is invalid`);
    }
    let url;
    try {
        url = new URL(value.url);
    }
    catch {
        throw new CatalogValidationError('CATALOG_ARTIFACT_INVALID', `${label}.url is invalid`);
    }
    if (typeof value.os !== 'string' ||
        !['macos', 'windows', 'linux'].includes(value.os) ||
        typeof value.arch !== 'string' ||
        !['aarch64', 'x86_64'].includes(value.arch) ||
        url.protocol !== 'https:' ||
        typeof value.fileName !== 'string' ||
        !value.fileName ||
        value.fileName === '.' ||
        value.fileName === '..' ||
        /[\\/\0:]/.test(value.fileName) ||
        !Number.isSafeInteger(value.size) || Number(value.size) < 1 ||
        typeof value.sha256 !== 'string' || !SHA256_PATTERN.test(value.sha256)) {
        throw new CatalogValidationError('CATALOG_ARTIFACT_INVALID', `${label} is invalid`);
    }
    return value;
}
function parseRelease(value, label) {
    if (!isRecord(value)) {
        throw new CatalogValidationError('CATALOG_RELEASE_INVALID', `${label} must be an object`);
    }
    requireExactFields(value, ['version', 'publishedAt', 'notes', 'publisherKeyId', 'hostApi', 'permissions', 'artifacts'], label, 'CATALOG_RELEASE_INVALID');
    if (typeof value.version !== 'string' || !SEMVER_PATTERN.test(value.version) ||
        typeof value.publishedAt !== 'string' ||
        typeof value.notes !== 'string' ||
        typeof value.publisherKeyId !== 'string' || !value.publisherKeyId ||
        !isRecord(value.hostApi) ||
        !Array.isArray(value.permissions) ||
        !Array.isArray(value.artifacts) || value.artifacts.length === 0) {
        throw new CatalogValidationError('CATALOG_RELEASE_INVALID', `${label} is invalid`);
    }
    timestamp(value.publishedAt, `${label}.publishedAt`, 'CATALOG_TIME_INVALID');
    requireExactFields(value.hostApi, ['min', 'max'], `${label}.hostApi`, 'CATALOG_RELEASE_INVALID');
    const hostMajor = typeof value.hostApi.min === 'string'
        ? /^([12])\.\d+\.\d+$/.exec(value.hostApi.min)?.[1]
        : undefined;
    if (!hostMajor || value.hostApi.max !== `${hostMajor}.x`) {
        throw new CatalogValidationError('CATALOG_RELEASE_INVALID', `${label}.hostApi is invalid`);
    }
    if (value.permissions.some((permission) => typeof permission !== 'string' || !CATALOG_PERMISSIONS.has(permission))) {
        throw new CatalogValidationError('CATALOG_PERMISSION_UNKNOWN', `${label} requests an unknown permission`);
    }
    if (new Set(value.permissions).size !== value.permissions.length) {
        throw new CatalogValidationError('CATALOG_RELEASE_INVALID', `${label} has duplicate permissions`);
    }
    if (hostMajor !== '2' &&
        value.permissions.some((permission) => typeof permission === 'string' && CATALOG_NATIVE_SERVICE_PERMISSIONS.has(permission))) {
        throw new CatalogValidationError('CATALOG_RELEASE_INVALID', `${label} HTTP permissions require Host API 2.x`);
    }
    const artifacts = value.artifacts.map((artifact, index) => parseArtifact(artifact, `${label}.artifacts[${index}]`));
    const targets = artifacts.map((artifact) => `${artifact.os}/${artifact.arch}`);
    if (new Set(targets).size !== targets.length) {
        throw new CatalogValidationError('CATALOG_DUPLICATE_TARGET', `${label} must contain at most one artifact per target`);
    }
    return {
        version: value.version,
        publishedAt: value.publishedAt,
        notes: value.notes,
        publisherKeyId: value.publisherKeyId,
        hostApi: value.hostApi,
        permissions: value.permissions,
        artifacts
    };
}
function parseCatalogApp(value, index) {
    const label = `catalog.apps[${index}]`;
    if (!isRecord(value)) {
        throw new CatalogValidationError('CATALOG_APP_INVALID', `${label} must be an object`);
    }
    requireExactFields(value, ['appId', 'name', 'description', 'publisherId', 'icon', 'channels'], label, 'CATALOG_APP_INVALID');
    if (typeof value.appId !== 'string' || !APP_ID_PATTERN.test(value.appId) ||
        typeof value.name !== 'string' || !value.name.trim() ||
        typeof value.description !== 'string' ||
        typeof value.publisherId !== 'string' || !value.publisherId ||
        typeof value.icon !== 'string' || !value.icon ||
        !isRecord(value.channels)) {
        throw new CatalogValidationError('CATALOG_APP_INVALID', `${label} is invalid`);
    }
    requireExactFields(value.channels, ['stable'], `${label}.channels`, 'CATALOG_APP_INVALID');
    return {
        appId: value.appId,
        name: value.name,
        description: value.description,
        publisherId: value.publisherId,
        icon: value.icon,
        channels: {
            stable: parseRelease(value.channels.stable, `${label}.channels.stable`)
        }
    };
}
export function parsePluginCatalog(value) {
    if (!isRecord(value)) {
        throw new CatalogValidationError('CATALOG_INVALID', 'Catalog must be an object');
    }
    requireExactFields(value, ['schemaVersion', 'sequence', 'generatedAt', 'expiresAt', 'signingKeyId', 'apps'], 'catalog', 'CATALOG_INVALID');
    if (value.schemaVersion !== 1) {
        throw new CatalogValidationError('CATALOG_SCHEMA_UNSUPPORTED', 'Only Catalog schema version 1 is supported');
    }
    if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1 ||
        typeof value.generatedAt !== 'string' ||
        typeof value.expiresAt !== 'string' ||
        typeof value.signingKeyId !== 'string' || !value.signingKeyId ||
        !Array.isArray(value.apps) || value.apps.length === 0) {
        throw new CatalogValidationError('CATALOG_INVALID', 'Catalog is invalid');
    }
    if (timestamp(value.generatedAt, 'catalog.generatedAt', 'CATALOG_TIME_INVALID') >=
        timestamp(value.expiresAt, 'catalog.expiresAt', 'CATALOG_TIME_INVALID')) {
        throw new CatalogValidationError('CATALOG_TIME_INVALID', 'Catalog must have an increasing validity window');
    }
    const apps = value.apps.map(parseCatalogApp);
    const appIds = apps.map((app) => app.appId);
    if (new Set(appIds).size !== appIds.length) {
        throw new CatalogValidationError('CATALOG_APP_INVALID', 'Catalog app IDs must be unique');
    }
    return {
        schemaVersion: 1,
        sequence: value.sequence,
        generatedAt: value.generatedAt,
        expiresAt: value.expiresAt,
        signingKeyId: value.signingKeyId,
        apps
    };
}
export function selectCatalogArtifact(catalog, appId, os, arch) {
    const app = catalog.apps.find((candidate) => candidate.appId === appId);
    if (!app)
        return null;
    const release = app.channels.stable;
    const artifact = release.artifacts.find((candidate) => candidate.os === os && candidate.arch === arch);
    return artifact ? { app, release, artifact } : null;
}
export function canonicalTrustMetadata(metadata) {
    return canonicalJson(metadata);
}
