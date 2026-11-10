import { canonicalJson } from './canonical.ts';

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
  files: Record<string, string>;
}

export type ManifestErrorCode =
  | 'MANIFEST_INVALID'
  | 'MANIFEST_SCHEMA_UNSUPPORTED'
  | 'MANIFEST_APP_ID_INVALID'
  | 'MANIFEST_VERSION_INVALID'
  | 'MANIFEST_PUBLISHER_INVALID'
  | 'MANIFEST_TARGET_INVALID'
  | 'MANIFEST_HOST_API_UNSUPPORTED'
  | 'MANIFEST_ENTRY_MISSING'
  | 'MANIFEST_FILE_PATH_INVALID'
  | 'MANIFEST_FILE_HASH_INVALID'
  | 'MANIFEST_PERMISSION_UNKNOWN';

export class ManifestValidationError extends Error {
  readonly code: ManifestErrorCode;

  constructor(code: ManifestErrorCode, message: string) {
    super(message);
    this.name = 'ManifestValidationError';
    this.code = code;
  }
}

export const P0_PERMISSIONS = [
  'host.theme.read',
  'host.file.save',
  'host.notification.show'
] as const;

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireExactFields(value: Record<string, unknown>, fields: string[], label: string) {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) {
    throw new ManifestValidationError('MANIFEST_INVALID', `${label} contains unknown field: ${unknown}`);
  }
}

export function parseManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) {
    throw new ManifestValidationError('MANIFEST_INVALID', 'Manifest must be an object');
  }
  requireExactFields(
    value,
    ['schemaVersion', 'appId', 'name', 'version', 'publisher', 'target', 'hostApi', 'ui', 'permissions', 'files'],
    'manifest'
  );
  if (value.schemaVersion !== 1) {
    throw new ManifestValidationError(
      'MANIFEST_SCHEMA_UNSUPPORTED',
      'Only manifest schema version 1 is supported'
    );
  }
  if (typeof value.appId !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(value.appId)) {
    throw new ManifestValidationError('MANIFEST_APP_ID_INVALID', 'appId is invalid');
  }
  if (typeof value.name !== 'string' || value.name.trim() === '') {
    throw new ManifestValidationError('MANIFEST_INVALID', 'name is required');
  }
  if (
    typeof value.version !== 'string' ||
    !SEMVER_PATTERN.test(value.version)
  ) {
    throw new ManifestValidationError('MANIFEST_VERSION_INVALID', 'version must be SemVer');
  }
  if (!isRecord(value.publisher)) {
    throw new ManifestValidationError('MANIFEST_PUBLISHER_INVALID', 'publisher is invalid');
  }
  requireExactFields(value.publisher, ['id', 'name', 'keyId'], 'publisher');
  if (
    typeof value.publisher.id !== 'string' ||
    typeof value.publisher.name !== 'string' ||
    typeof value.publisher.keyId !== 'string' ||
    !value.publisher.id ||
    !value.publisher.name ||
    !value.publisher.keyId
  ) {
    throw new ManifestValidationError('MANIFEST_PUBLISHER_INVALID', 'publisher is invalid');
  }
  if (!isRecord(value.target)) {
    throw new ManifestValidationError('MANIFEST_TARGET_INVALID', 'target is invalid');
  }
  requireExactFields(value.target, ['os', 'arch'], 'target');
  if (
    !['macos', 'windows', 'linux'].includes(String(value.target.os)) ||
    !['aarch64', 'x86_64'].includes(String(value.target.arch))
  ) {
    throw new ManifestValidationError('MANIFEST_TARGET_INVALID', 'target is invalid');
  }
  if (!isRecord(value.hostApi)) {
    throw new ManifestValidationError(
      'MANIFEST_HOST_API_UNSUPPORTED',
      'Host API range must target major version 1'
    );
  }
  requireExactFields(value.hostApi, ['min', 'max'], 'hostApi');
  if (
    typeof value.hostApi.min !== 'string' ||
    !/^1\.\d+\.\d+$/.test(value.hostApi.min) ||
    value.hostApi.max !== '1.x'
  ) {
    throw new ManifestValidationError(
      'MANIFEST_HOST_API_UNSUPPORTED',
      'Host API range must target major version 1'
    );
  }
  if (!Array.isArray(value.permissions)) {
    throw new ManifestValidationError('MANIFEST_INVALID', 'permissions must be an array');
  }
  const knownPermissions = new Set<string>(P0_PERMISSIONS);
  if (
    value.permissions.some(
      (permission) => typeof permission !== 'string' || !knownPermissions.has(permission)
    )
  ) {
    throw new ManifestValidationError(
      'MANIFEST_PERMISSION_UNKNOWN',
      'Manifest requests an unknown permission'
    );
  }
  if (!isRecord(value.files) || Object.keys(value.files).length === 0) {
    throw new ManifestValidationError('MANIFEST_INVALID', 'files must not be empty');
  }
  for (const [path, hash] of Object.entries(value.files)) {
    if (
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..')
    ) {
      throw new ManifestValidationError(
        'MANIFEST_FILE_PATH_INVALID',
        `Unsafe package path: ${path}`
      );
    }
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new ManifestValidationError(
        'MANIFEST_FILE_HASH_INVALID',
        `Invalid SHA-256 for ${path}`
      );
    }
  }
  if (!isRecord(value.ui)) {
    throw new ManifestValidationError(
      'MANIFEST_ENTRY_MISSING',
      'UI entry must be declared in files'
    );
  }
  requireExactFields(value.ui, ['entry'], 'ui');
  if (
    typeof value.ui.entry !== 'string' ||
    !(value.ui.entry in value.files)
  ) {
    throw new ManifestValidationError(
      'MANIFEST_ENTRY_MISSING',
      'UI entry must be declared in files'
    );
  }
  return value as unknown as PluginManifest;
}

export function canonicalManifest(manifest: PluginManifest): string {
  return canonicalJson(manifest);
}

export * from './catalog.ts';
