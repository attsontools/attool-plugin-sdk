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

const httpManifest = {
  ...codecManifest,
  appId: 'com.attson.http',
  name: 'HTTP 请求',
  hostApi: {
    min: '2.0.0',
    max: '2.x'
  },
  permissions: [
    'host.theme.read',
    'host.file.save',
    'host.http.request',
    'host.http.stream',
    'host.http.data'
  ],
  nativeService: {
    entry: 'native/athttp-service',
    version: '0.1.0-alpha.0',
    sha256: 'c'.repeat(64),
    protocolVersion: 1
  },
  files: {
    ...codecManifest.files,
    'native/athttp-service': 'c'.repeat(64)
  }
};

const aria2Manifest = {
  ...httpManifest,
  appId: 'com.attson.aria2',
  name: 'Aria2 下载',
  permissions: ['host.theme.read', 'host.download.tasks'],
  nativeService: {
    ...httpManifest.nativeService,
    entry: 'native/ataria2-service'
  },
  files: {
    ...codecManifest.files,
    'native/ataria2-service': 'c'.repeat(64)
  }
};

const templateManifest = {
  ...httpManifest,
  appId: 'com.attson.template',
  name: '主图模板',
  permissions: ['host.theme.read', 'host.template.project'],
  nativeService: {
    ...httpManifest.nativeService,
    entry: 'native/attemplate-service'
  },
  files: {
    ...codecManifest.files,
    'native/attemplate-service': 'c'.repeat(64)
  }
};

const clipboardManifest = {
  ...httpManifest,
  appId: 'com.attson.clipboard',
  name: '剪贴板',
  ui: {
    entry: 'ui/index.html',
    windows: {
      history: { entry: 'ui/history.html', presentation: 'bottomPanel' },
      preview: { entry: 'ui/preview.html', presentation: 'centeredDialog' }
    }
  },
  permissions: ['host.theme.read', 'host.ui.auxiliary', 'host.clipboard.history'],
  nativeService: {
    ...httpManifest.nativeService,
    entry: 'native/atclipboard-service',
    lifecycle: 'background'
  },
  files: {
    ...codecManifest.files,
    'ui/history.html': 'd'.repeat(64),
    'ui/preview.html': 'e'.repeat(64),
    'native/atclipboard-service': 'c'.repeat(64)
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

  it('parses a Host API 2.x manifest with a signed native service', () => {
    const manifest = parseManifest(httpManifest);

    assert.equal(manifest.hostApi.max, '2.x');
    assert.equal(manifest.nativeService?.entry, 'native/athttp-service');
    assert.equal(manifest.nativeService?.sha256, httpManifest.files['native/athttp-service']);
    assert.match(canonicalManifest(manifest), /"nativeService":\{"entry":"native\/athttp-service"/);
  });

  it('accepts the download task capability only for Host API 2 native services', () => {
    const manifest = parseManifest(aria2Manifest);

    assert.deepEqual(manifest.permissions, ['host.theme.read', 'host.download.tasks']);
    assert.equal(manifest.nativeService?.entry, 'native/ataria2-service');

    for (const value of [
      { ...aria2Manifest, nativeService: undefined },
      { ...aria2Manifest, hostApi: codecManifest.hostApi }
    ]) {
      assert.throws(
        () => parseManifest(value),
        (error) =>
          error instanceof ManifestValidationError &&
          error.code === 'MANIFEST_NATIVE_SERVICE_REQUIRED'
      );
    }
  });

  it('accepts the template project capability only for Host API 2 native services', () => {
    const manifest = parseManifest(templateManifest);

    assert.deepEqual(manifest.permissions, ['host.theme.read', 'host.template.project']);
    assert.equal(manifest.nativeService?.entry, 'native/attemplate-service');

    for (const value of [
      { ...templateManifest, nativeService: undefined },
      { ...templateManifest, hostApi: codecManifest.hostApi }
    ]) {
      assert.throws(
        () => parseManifest(value),
        (error) =>
          error instanceof ManifestValidationError &&
          error.code === 'MANIFEST_NATIVE_SERVICE_REQUIRED'
      );
    }
  });

  it('accepts a background clipboard service with signed auxiliary windows', () => {
    const manifest = parseManifest(clipboardManifest);

    assert.equal(manifest.nativeService?.lifecycle, 'background');
    assert.deepEqual(manifest.ui.windows, {
      history: { entry: 'ui/history.html', presentation: 'bottomPanel' },
      preview: { entry: 'ui/preview.html', presentation: 'centeredDialog' }
    });
    assert.deepEqual(manifest.permissions, [
      'host.theme.read',
      'host.ui.auxiliary',
      'host.clipboard.history'
    ]);
  });

  it('accepts an explicitly empty auxiliary window map like the host', () => {
    const manifest = parseManifest({
      ...codecManifest,
      ui: { ...codecManifest.ui, windows: {} }
    });

    assert.deepEqual(manifest.ui.windows, {});
  });

  it('rejects invalid background lifecycle and auxiliary window declarations', () => {
    const invalidCases: Array<[string, unknown, string]> = [
      [
        'unknown lifecycle',
        {
          ...clipboardManifest,
          nativeService: { ...clipboardManifest.nativeService, lifecycle: 'always' }
        },
        'MANIFEST_NATIVE_SERVICE_INVALID'
      ],
      [
        'background without a native service permission',
        { ...clipboardManifest, permissions: ['host.theme.read', 'host.ui.auxiliary'] },
        'MANIFEST_NATIVE_SERVICE_REQUIRED'
      ],
      [
        'unsafe window id',
        {
          ...clipboardManifest,
          ui: {
            ...clipboardManifest.ui,
            windows: { '../history': clipboardManifest.ui.windows.history }
          }
        },
        'MANIFEST_UI_WINDOW_INVALID'
      ],
      [
        'unsigned window entry',
        {
          ...clipboardManifest,
          ui: {
            ...clipboardManifest.ui,
            windows: {
              ...clipboardManifest.ui.windows,
              history: { entry: 'ui/missing.html', presentation: 'bottomPanel' }
            }
          }
        },
        'MANIFEST_ENTRY_MISSING'
      ],
      [
        'unknown window presentation',
        {
          ...clipboardManifest,
          ui: {
            ...clipboardManifest.ui,
            windows: {
              ...clipboardManifest.ui.windows,
              history: { entry: 'ui/history.html', presentation: 'floating' }
            }
          }
        },
        'MANIFEST_UI_WINDOW_INVALID'
      ],
      [
        'too many windows',
        {
          ...clipboardManifest,
          ui: {
            ...clipboardManifest.ui,
            windows: Object.fromEntries(
              Array.from({ length: 5 }, (_, index) => [
                `window-${index}`,
                clipboardManifest.ui.windows.history
              ])
            )
          }
        },
        'MANIFEST_UI_WINDOW_INVALID'
      ],
      [
        'clipboard permission on Host API 1',
        { ...clipboardManifest, hostApi: codecManifest.hostApi },
        'MANIFEST_NATIVE_SERVICE_REQUIRED'
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

  it('keeps Host API 1.x manifests canonical and rejects invalid native service contracts', () => {
    const invalidCases: Array<[string, unknown, string]> = [
      [
        'Host API 2 without native service',
        { ...httpManifest, nativeService: undefined },
        'MANIFEST_NATIVE_SERVICE_REQUIRED'
      ],
      [
        'HTTP permission without native service',
        {
          ...codecManifest,
          permissions: ['host.http.request']
        },
        'MANIFEST_NATIVE_SERVICE_REQUIRED'
      ],
      [
        'native service on Host API 1',
        { ...httpManifest, hostApi: codecManifest.hostApi },
        'MANIFEST_NATIVE_SERVICE_REQUIRED'
      ],
      [
        'service entry missing from files',
        {
          ...httpManifest,
          files: codecManifest.files
        },
        'MANIFEST_NATIVE_SERVICE_INVALID'
      ],
      [
        'service hash mismatch',
        {
          ...httpManifest,
          nativeService: { ...httpManifest.nativeService, sha256: 'd'.repeat(64) }
        },
        'MANIFEST_NATIVE_SERVICE_INVALID'
      ],
      [
        'service version mismatch',
        {
          ...httpManifest,
          nativeService: { ...httpManifest.nativeService, version: '0.1.0-alpha.1' }
        },
        'MANIFEST_NATIVE_SERVICE_INVALID'
      ],
      [
        'unsupported service protocol',
        {
          ...httpManifest,
          nativeService: { ...httpManifest.nativeService, protocolVersion: 2 }
        },
        'MANIFEST_NATIVE_SERVICE_INVALID'
      ],
      [
        'unknown service field',
        {
          ...httpManifest,
          nativeService: { ...httpManifest.nativeService, args: [] }
        },
        'MANIFEST_INVALID'
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

  it('rejects unsupported or unsafe manifest values with stable error codes', () => {
    const invalidCases: Array<[string, unknown, string]> = [
      ['schema major', { ...codecManifest, schemaVersion: 2 }, 'MANIFEST_SCHEMA_UNSUPPORTED'],
      ['app id', { ...codecManifest, appId: '../codec' }, 'MANIFEST_APP_ID_INVALID'],
      ['version', { ...codecManifest, version: '1.0.0-alpha..1' }, 'MANIFEST_VERSION_INVALID'],
      ['unknown root field', { ...codecManifest, native: {} }, 'MANIFEST_INVALID'],
      [
        'unknown nested field',
        { ...codecManifest, publisher: { ...codecManifest.publisher, website: 'https://attson.cn' } },
        'MANIFEST_INVALID'
      ],
      [
        'target',
        { ...codecManifest, target: { os: 'linux', arch: 'armv7' } },
        'MANIFEST_TARGET_INVALID'
      ],
      [
        'host api',
        { ...codecManifest, hostApi: { min: '3.0.0', max: '3.x' } },
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
