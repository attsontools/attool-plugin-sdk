import { type KeyLike } from 'node:crypto';
import { type PluginManifest } from './index.ts';
import { type CatalogTrustMetadata } from './catalog.ts';
export declare function signManifest(manifest: PluginManifest, privateKey: KeyLike): string;
export declare function verifyManifestSignature(manifest: PluginManifest, signature: string, publicKey: KeyLike): boolean;
export declare function signTrustMetadata(metadata: CatalogTrustMetadata, privateKey: KeyLike): string;
export declare function verifyTrustMetadataSignature(metadata: CatalogTrustMetadata, signature: string, publicKey: KeyLike): boolean;
