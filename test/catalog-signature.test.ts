import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  canonicalTrustMetadata,
  parsePluginCatalog,
  parseTrustRoot
} from '../src/index.ts';
import { signTrustMetadata, verifyTrustMetadataSignature } from '../src/node.ts';

const fixturePublicKey = 'pZQzAC2N9PEN86-KXe878Z5IKqzt3GPl91tmhDUR2B0';
const privateKey = createPrivateKey({
  key: {
    kty: 'OKP',
    crv: 'Ed25519',
    d: 'nWGxne_9WmZMRxVFkYgNRQYr9Wz17zqCxbHXh1QMjgA',
    x: fixturePublicKey
  },
  format: 'jwk'
});
const publicKey = createPublicKey(privateKey);

const root = parseTrustRoot({
  schemaVersion: 1,
  sequence: 1,
  issuedAt: '2026-11-10T00:00:00Z',
  expiresAt: '2027-11-10T00:00:00Z',
  catalogKeys: [{
    keyId: 'catalog-2026-01', algorithm: 'ed25519',
    publicKey: 'pZQzAC2N9PEN86+KXe878Z5IKqzt3GPl91tmhDUR2B0=', status: 'active',
    notBefore: '2026-11-01T00:00:00Z', notAfter: '2027-05-01T00:00:00Z'
  }],
  publishers: [{
    publisherId: 'com.attson', name: 'Attson',
    keys: [{
      keyId: 'attson-codec-2026-01', algorithm: 'ed25519',
      publicKey: 'IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI=', status: 'active',
      notBefore: '2026-11-01T00:00:00Z', notAfter: '2027-05-01T00:00:00Z'
    }]
  }]
});

const catalog = parsePluginCatalog({
  schemaVersion: 1,
  sequence: 18,
  generatedAt: '2026-11-10T08:00:00Z',
  expiresAt: '2026-11-17T08:00:00Z',
  signingKeyId: 'catalog-2026-01',
  apps: [{
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
        artifacts: [{
          os: 'linux',
          arch: 'x86_64',
          url: 'https://github.com/attsontools/atcodec/releases/download/v1.1.0/AT.Codec_1.1.0_linux_x86_64.atpkg',
          fileName: 'AT.Codec_1.1.0_linux_x86_64.atpkg',
          size: 4096,
          sha256: 'a'.repeat(64)
        }]
      }
    }
  }]
});

describe('catalog trust metadata signatures', () => {
  it('matches the fixed canonical Root and Ed25519 signature fixture', () => {
    const canonical = canonicalTrustMetadata(root);
    const signature = signTrustMetadata(root, privateKey);

    assert.equal(createPublicKey(privateKey).export({ format: 'jwk' }).x, fixturePublicKey);
    assert.equal(
      canonical,
      '{"catalogKeys":[{"algorithm":"ed25519","keyId":"catalog-2026-01","notAfter":"2027-05-01T00:00:00Z","notBefore":"2026-11-01T00:00:00Z","publicKey":"pZQzAC2N9PEN86+KXe878Z5IKqzt3GPl91tmhDUR2B0=","status":"active"}],"expiresAt":"2027-11-10T00:00:00Z","issuedAt":"2026-11-10T00:00:00Z","publishers":[{"keys":[{"algorithm":"ed25519","keyId":"attson-codec-2026-01","notAfter":"2027-05-01T00:00:00Z","notBefore":"2026-11-01T00:00:00Z","publicKey":"IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI=","status":"active"}],"name":"Attson","publisherId":"com.attson"}],"schemaVersion":1,"sequence":1}'
    );
    assert.equal(
      signature,
      '6xr/t+I1UvVFB2q7vp2avUQPqX4cF6fqz1oIO/XhfPFuopggAbHWt2UOHXxTF73EWUI8+dcsxk9LZMxnj+pfAg=='
    );
    assert.equal(verifyTrustMetadataSignature(root, signature, publicKey), true);
    assert.equal(verifyTrustMetadataSignature({ ...root, sequence: 2 }, signature, publicKey), false);
  });

  it('matches the fixed canonical Catalog and Ed25519 signature fixture', () => {
    const canonical = canonicalTrustMetadata(catalog);
    const signature = signTrustMetadata(catalog, privateKey);

    assert.equal(
      canonical,
      '{"apps":[{"appId":"com.attson.codec","channels":{"stable":{"artifacts":[{"arch":"x86_64","fileName":"AT.Codec_1.1.0_linux_x86_64.atpkg","os":"linux","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","size":4096,"url":"https://github.com/attsontools/atcodec/releases/download/v1.1.0/AT.Codec_1.1.0_linux_x86_64.atpkg"}],"hostApi":{"max":"1.x","min":"1.0.0"},"notes":"新增一键复制转换结果","permissions":["host.theme.read","host.file.save","host.notification.show"],"publishedAt":"2026-11-10T07:00:00Z","publisherKeyId":"attson-codec-2026-01","version":"1.1.0"}},"description":"Base64、URL、Unicode、Hex、Hash 与 JWT","icon":"codec","name":"编码转换","publisherId":"com.attson"}],"expiresAt":"2026-11-17T08:00:00Z","generatedAt":"2026-11-10T08:00:00Z","schemaVersion":1,"sequence":18,"signingKeyId":"catalog-2026-01"}'
    );
    assert.equal(
      signature,
      'rPRz4GMQmvhJ0x0J5y+EUxikuRHOSPJ1Q/t3TH1EMOln5XR2ZrbPCkk9uqgn5s7TTW+Cf7RJxYSO9NK69K2vAA=='
    );
    assert.equal(verifyTrustMetadataSignature(catalog, signature, publicKey), true);
    assert.equal(
      verifyTrustMetadataSignature({ ...catalog, sequence: 19 }, signature, publicKey),
      false
    );
  });
});
