import { sign, verify, type KeyLike } from 'node:crypto';

import { canonicalManifest, type PluginManifest } from './index.ts';
import {
  canonicalTrustMetadata,
  type CatalogTrustMetadata
} from './catalog.ts';

export function signManifest(manifest: PluginManifest, privateKey: KeyLike): string {
  return sign(null, Buffer.from(canonicalManifest(manifest), 'utf8'), privateKey).toString('base64');
}

export function verifyManifestSignature(
  manifest: PluginManifest,
  signature: string,
  publicKey: KeyLike
): boolean {
  return verify(
    null,
    Buffer.from(canonicalManifest(manifest), 'utf8'),
    publicKey,
    Buffer.from(signature, 'base64')
  );
}

export function signTrustMetadata(
  metadata: CatalogTrustMetadata,
  privateKey: KeyLike
): string {
  return sign(
    null,
    Buffer.from(canonicalTrustMetadata(metadata), 'utf8'),
    privateKey
  ).toString('base64');
}

export function verifyTrustMetadataSignature(
  metadata: CatalogTrustMetadata,
  signature: string,
  publicKey: KeyLike
): boolean {
  return verify(
    null,
    Buffer.from(canonicalTrustMetadata(metadata), 'utf8'),
    publicKey,
    Buffer.from(signature, 'base64')
  );
}
