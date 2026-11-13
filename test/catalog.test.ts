import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CatalogValidationError,
  assertMetadataNotRolledBack,
  canSignWithCatalogKey,
  canVerifyWithCatalogKey,
  parsePluginCatalog,
  selectCatalogArtifact,
  parseTrustRoot
} from '../src/index.ts';

const root = {
  schemaVersion: 1,
  sequence: 3,
  issuedAt: '2026-11-10T00:00:00Z',
  expiresAt: '2027-11-10T00:00:00Z',
  catalogKeys: [
    {
      keyId: 'catalog-2026-01',
      algorithm: 'ed25519',
      publicKey: 'ERERERERERERERERERERERERERERERERERERERERERE=',
      status: 'active',
      notBefore: '2026-11-01T00:00:00Z',
      notAfter: '2027-05-01T00:00:00Z'
    }
  ],
  publishers: [
    {
      publisherId: 'com.attson',
      name: 'Attson',
      keys: [
        {
          keyId: 'attson-codec-2026-01',
          algorithm: 'ed25519',
          publicKey: 'IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI=',
          status: 'active',
          notBefore: '2026-11-01T00:00:00Z',
          notAfter: '2027-05-01T00:00:00Z'
        }
      ]
    }
  ]
};

const catalog = {
  schemaVersion: 1,
  sequence: 18,
  generatedAt: '2026-11-10T08:00:00Z',
  expiresAt: '2026-11-17T08:00:00Z',
  signingKeyId: 'catalog-2026-01',
  apps: [
    {
      appId: 'com.attson.codec',
      name: '编码转换',
      description: 'Base64、URL、Unicode、Hex、Hash 与 JWT',
      publisherId: 'com.attson',
      icon: 'codec',
      channels: {
        stable: {
          version: '1.1.0',
          publishedAt: '2026-11-10T07:00:00Z',
          notes: '新增一键复制转换结果',
          publisherKeyId: 'attson-codec-2026-01',
          hostApi: { min: '1.0.0', max: '1.x' },
          permissions: ['host.theme.read', 'host.file.save', 'host.notification.show'],
          artifacts: [
            {
              os: 'linux',
              arch: 'x86_64',
              url: 'https://github.com/attsontools/atcodec/releases/download/v1.1.0/AT.Codec_1.1.0_linux_x86_64.atpkg',
              fileName: 'AT.Codec_1.1.0_linux_x86_64.atpkg',
              size: 4096,
              sha256: 'a'.repeat(64)
            },
            {
              os: 'macos',
              arch: 'aarch64',
              url: 'https://github.com/attsontools/atcodec/releases/download/v1.1.0/AT.Codec_1.1.0_macos_aarch64.atpkg',
              fileName: 'AT.Codec_1.1.0_macos_aarch64.atpkg',
              size: 4097,
              sha256: 'b'.repeat(64)
            }
          ]
        }
      }
    }
  ]
};

const httpCatalog = {
  ...catalog,
  apps: [
    {
      appId: 'com.attson.http',
      name: 'HTTP 请求',
      description: 'HTTP、SSE 与 WebSocket 调试',
      publisherId: 'com.attson',
      icon: 'http',
      channels: {
        stable: {
          ...catalog.apps[0]!.channels.stable,
          publisherKeyId: 'attson-http-2026-01',
          hostApi: { min: '2.0.0', max: '2.x' },
          permissions: [
            'host.theme.read',
            'host.file.save',
            'host.http.request',
            'host.http.stream',
            'host.http.data'
          ]
        }
      }
    }
  ]
};

describe('plugin catalog trust contract', () => {
  it('strictly parses a valid Root v1 document', () => {
    const parsed = parseTrustRoot(root);

    assert.equal(parsed.sequence, 3);
    assert.equal(parsed.catalogKeys[0]?.keyId, 'catalog-2026-01');
    assert.equal(parsed.publishers[0]?.keys[0]?.keyId, 'attson-codec-2026-01');
    assert.throws(
      () => parseTrustRoot({ ...root, mirror: 'https://example.com' }),
      (error) => error instanceof CatalogValidationError && error.code === 'TRUST_ROOT_INVALID'
    );
    assert.throws(
      () => parseTrustRoot({
        ...root,
        catalogKeys: [{ ...root.catalogKeys[0], comment: 'unexpected' }]
      }),
      (error) => error instanceof CatalogValidationError && error.code === 'TRUST_ROOT_INVALID'
    );
  });

  it('enforces key identity, Ed25519 material, validity windows, and sequence monotonicity', () => {
    const duplicateKey = structuredClone(root);
    duplicateKey.publishers[0]!.keys[0]!.keyId = 'catalog-2026-01';
    assert.throws(
      () => parseTrustRoot(duplicateKey),
      (error) => error instanceof CatalogValidationError && error.code === 'TRUST_ROOT_DUPLICATE_KEY'
    );

    const invalidPublicKey = structuredClone(root);
    invalidPublicKey.catalogKeys[0]!.publicKey = 'not-a-raw-ed25519-key';
    assert.throws(
      () => parseTrustRoot(invalidPublicKey),
      (error) => error instanceof CatalogValidationError && error.code === 'TRUST_ROOT_KEY_INVALID'
    );

    const invalidWindow = structuredClone(root);
    invalidWindow.catalogKeys[0]!.notAfter = invalidWindow.catalogKeys[0]!.notBefore;
    assert.throws(
      () => parseTrustRoot(invalidWindow),
      (error) => error instanceof CatalogValidationError && error.code === 'TRUST_ROOT_TIME_INVALID'
    );

    const parsed = parseTrustRoot(root);
    assert.doesNotThrow(() => assertMetadataNotRolledBack(parsed, 3));
    assert.throws(
      () => assertMetadataNotRolledBack(parsed, 4),
      (error) => error instanceof CatalogValidationError && error.code === 'METADATA_SEQUENCE_ROLLBACK'
    );
  });

  it('rejects array values where trust metadata requires string scalars', () => {
    const invalidStatus = structuredClone(root);
    invalidStatus.catalogKeys[0]!.status = ['revoked'] as unknown as string;
    assert.throws(
      () => parseTrustRoot(invalidStatus),
      (error) => error instanceof CatalogValidationError
    );

    for (const field of ['os', 'arch', 'url'] as const) {
      const invalidArtifact = structuredClone(catalog);
      const artifact = invalidArtifact.apps[0]!.channels.stable.artifacts[0]!;
      artifact[field] = [artifact[field]] as never;
      assert.throws(
        () => parsePluginCatalog(invalidArtifact),
        (error) =>
          error instanceof CatalogValidationError &&
          error.code === 'CATALOG_ARTIFACT_INVALID',
        field
      );
    }
  });

  it('rejects artifact file names that are unsafe on supported platforms', () => {
    for (const fileName of ['.', '..', '..\\escape.atpkg', 'C:escape.atpkg']) {
      const invalidArtifact = structuredClone(catalog);
      invalidArtifact.apps[0]!.channels.stable.artifacts[0]!.fileName = fileName;
      assert.throws(
        () => parsePluginCatalog(invalidArtifact),
        (error) =>
          error instanceof CatalogValidationError &&
          error.code === 'CATALOG_ARTIFACT_INVALID',
        fileName
      );
    }
  });

  it('rejects calendar-invalid UTC timestamps instead of normalizing them', () => {
    const invalidRootTime = structuredClone(root);
    invalidRootTime.issuedAt = '2026-02-30T00:00:00Z';
    assert.throws(
      () => parseTrustRoot(invalidRootTime),
      (error) =>
        error instanceof CatalogValidationError &&
        error.code === 'TRUST_ROOT_TIME_INVALID'
    );

    const invalidCatalogTime = structuredClone(catalog);
    invalidCatalogTime.generatedAt = '2026-02-30T00:00:00Z';
    assert.throws(
      () => parsePluginCatalog(invalidCatalogTime),
      (error) =>
        error instanceof CatalogValidationError &&
        error.code === 'CATALOG_TIME_INVALID'
    );

    const active = parseTrustRoot(root).catalogKeys[0]!;
    assert.equal(canSignWithCatalogKey(active, '2026-02-30T00:00:00Z'), false);
  });

  it('uses active keys for new signatures, retired keys for valid historical signatures, and never revoked keys', () => {
    const active = parseTrustRoot(root).catalogKeys[0]!;
    const retired = { ...active, status: 'retired' as const };
    const revoked = { ...active, status: 'revoked' as const };

    assert.equal(canSignWithCatalogKey(active, '2026-12-01T00:00:00Z'), true);
    assert.equal(canSignWithCatalogKey(retired, '2026-12-01T00:00:00Z'), false);
    assert.equal(canVerifyWithCatalogKey(retired, '2026-12-01T00:00:00Z'), true);
    assert.equal(canVerifyWithCatalogKey(revoked, '2026-12-01T00:00:00Z'), false);
    assert.equal(canVerifyWithCatalogKey(active, '2028-01-01T00:00:00Z'), false);
  });

  it('strictly parses Catalog v1 and selects one stable artifact for the current target', () => {
    const parsed = parsePluginCatalog(catalog);
    const selected = selectCatalogArtifact(parsed, 'com.attson.codec', 'linux', 'x86_64');

    assert.equal(parsed.sequence, 18);
    assert.equal(selected?.release.version, '1.1.0');
    assert.equal(selected?.artifact.fileName, 'AT.Codec_1.1.0_linux_x86_64.atpkg');
    assert.equal(selectCatalogArtifact(parsed, 'com.attson.codec', 'windows', 'x86_64'), null);

    const duplicateTarget = structuredClone(catalog);
    duplicateTarget.apps[0]!.channels.stable.artifacts.push({
      ...duplicateTarget.apps[0]!.channels.stable.artifacts[0]!,
      fileName: 'duplicate.atpkg'
    });
    assert.throws(
      () => parsePluginCatalog(duplicateTarget),
      (error) => error instanceof CatalogValidationError && error.code === 'CATALOG_DUPLICATE_TARGET'
    );

    const unknownPermission = structuredClone(catalog);
    unknownPermission.apps[0]!.channels.stable.permissions.push('host.process.spawn');
    assert.throws(
      () => parsePluginCatalog(unknownPermission),
      (error) => error instanceof CatalogValidationError && error.code === 'CATALOG_PERMISSION_UNKNOWN'
    );

    const unsafeUrl = structuredClone(catalog);
    unsafeUrl.apps[0]!.channels.stable.artifacts[0]!.url = 'http://example.com/codec.atpkg';
    assert.throws(
      () => parsePluginCatalog(unsafeUrl),
      (error) => error instanceof CatalogValidationError && error.code === 'CATALOG_ARTIFACT_INVALID'
    );
  });

  it('accepts Host API 2.x HTTP releases without changing Host API 1.x releases', () => {
    const parsed = parsePluginCatalog(httpCatalog);

    assert.equal(parsed.apps[0]?.channels.stable.hostApi.max, '2.x');
    assert.deepEqual(
      parsed.apps[0]?.channels.stable.permissions.slice(-3),
      ['host.http.request', 'host.http.stream', 'host.http.data']
    );
    assert.equal(parsePluginCatalog(catalog).apps[0]?.channels.stable.hostApi.max, '1.x');
  });

  it('requires HTTP Catalog permissions to use Host API 2.x', () => {
    const invalidHttpPermission = structuredClone(catalog);
    invalidHttpPermission.apps[0]!.channels.stable.permissions = ['host.http.request'];
    assert.throws(
      () => parsePluginCatalog(invalidHttpPermission),
      (error) =>
        error instanceof CatalogValidationError &&
        error.code === 'CATALOG_RELEASE_INVALID'
    );

    const unsupportedMajor = structuredClone(httpCatalog);
    unsupportedMajor.apps[0]!.channels.stable.hostApi = { min: '3.0.0', max: '3.x' };
    assert.throws(
      () => parsePluginCatalog(unsupportedMajor),
      (error) =>
        error instanceof CatalogValidationError &&
        error.code === 'CATALOG_RELEASE_INVALID'
    );
  });
});
