import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { describe, it } from 'node:test';

import { parseManifest } from '../src/index.ts';
import { signManifest, verifyManifestSignature } from '../src/node.ts';

const privateKey = createPrivateKey({
  key: {
    kty: 'OKP',
    crv: 'Ed25519',
    d: 'nWGxne_9WmZMRxVFkYgNRQYr9Wz17zqCxbHXh1QMjgA',
    x: '11qYAYdk9JX8W0R1F-Xu2gf3yZB-wxpXFYOGG46xQ5s'
  },
  format: 'jwk'
});
const publicKey = createPublicKey(privateKey);

const manifest = parseManifest({
  schemaVersion: 1,
  appId: 'com.attson.codec',
  name: 'AT Codec',
  version: '0.1.0-alpha.0',
  publisher: { id: 'com.attson', name: 'Attson', keyId: 'attool-p0-test' },
  target: { os: 'linux', arch: 'x86_64' },
  hostApi: { min: '1.0.0', max: '1.x' },
  ui: { entry: 'ui/index.html' },
  permissions: ['host.theme.read'],
  files: {
    LICENSE: 'a'.repeat(64),
    'ui/index.html': 'b'.repeat(64)
  }
});

describe('manifest signature', () => {
  it('verifies the canonical manifest and rejects a modified manifest', () => {
    const signature = signManifest(manifest, privateKey);

    assert.equal(
      signature,
      'z9u457R/Jx9ya1MGaXziJpRAgP1RgMNaUM6pwlO+vPdJmlAK/5ejHqPpD+UjyUHjtbFYrYGfZQqeAPk+xEATCA=='
    );
    assert.equal(verifyManifestSignature(manifest, signature, publicKey), true);
    assert.equal(
      verifyManifestSignature({ ...manifest, version: '0.1.1' }, signature, publicKey),
      false
    );
  });
});
