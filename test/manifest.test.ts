import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalManifest, ManifestValidationError, parseManifest } from '../src/index.ts';

const codecManifest = {
  schemaVersion: 1,
  appId: 'com.attson.codec',
  name: 'AT Codec',
  version: '0.1.0-alpha.0',
  publisher: {
    id: 'com.attson',
    name: 'Attson',
    keyId: 'attool-p0-test'
  },
  target: {
    os: 'linux',
    arch: 'x86_64'
  },
  hostApi: {
    min: '1.0.0',
    max: '1.x'
  },
  ui: {
    entry: 'ui/index.html'
  },
  permissions: ['host.theme.read', 'host.file.save', 'host.notification.show'],
  files: {
    'LICENSE': 'a'.repeat(64),
    'ui/index.html': 'b'.repeat(64)
  }
};

describe('plugin manifest contract', () => {
  it('parses a valid manifest and produces deterministic signing bytes', () => {
    const manifest = parseManifest(codecManifest);

    assert.equal(manifest.appId, 'com.attson.codec');
    assert.equal(
      canonicalManifest(manifest),
      `{"appId":"com.attson.codec","files":{"LICENSE":"${'a'.repeat(64)}","ui/index.html":"${'b'.repeat(64)}"},"hostApi":{"max":"1.x","min":"1.0.0"},"name":"AT Codec","permissions":["host.theme.read","host.file.save","host.notification.show"],"publisher":{"id":"com.attson","keyId":"attool-p0-test","name":"Attson"},"schemaVersion":1,"target":{"arch":"x86_64","os":"linux"},"ui":{"entry":"ui/index.html"},"version":"0.1.0-alpha.0"}`
    );
  });

  it('rejects unsupported or unsafe manifest values with stable error codes', () => {
    const invalidCases: Array<[string, unknown, string]> = [
      ['schema major', { ...codecManifest, schemaVersion: 2 }, 'MANIFEST_SCHEMA_UNSUPPORTED'],
      ['app id', { ...codecManifest, appId: '../codec' }, 'MANIFEST_APP_ID_INVALID'],
      [
        'target',
        { ...codecManifest, target: { os: 'linux', arch: 'armv7' } },
        'MANIFEST_TARGET_INVALID'
      ],
      [
        'host api',
        { ...codecManifest, hostApi: { min: '2.0.0', max: '2.x' } },
        'MANIFEST_HOST_API_UNSUPPORTED'
      ],
      [
        'unsafe file path',
        { ...codecManifest, files: { ...codecManifest.files, '../escape': 'c'.repeat(64) } },
        'MANIFEST_FILE_PATH_INVALID'
      ],
      [
        'hash',
        { ...codecManifest, files: { ...codecManifest.files, LICENSE: 'not-a-sha256' } },
        'MANIFEST_FILE_HASH_INVALID'
      ],
      [
        'undeclared entry',
        { ...codecManifest, ui: { entry: 'ui/missing.html' } },
        'MANIFEST_ENTRY_MISSING'
      ],
      [
        'permission',
        { ...codecManifest, permissions: ['host.process.spawn'] },
        'MANIFEST_PERMISSION_UNKNOWN'
      ]
    ];

    for (const [label, value, code] of invalidCases) {
      assert.throws(
        () => parseManifest(value),
        (error) => error instanceof ManifestValidationError && error.code === code,
        label
      );
    }
  });
});
