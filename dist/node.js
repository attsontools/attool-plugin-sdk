import { sign, verify } from 'node:crypto';
import { canonicalManifest } from "./index.js";
import { canonicalTrustMetadata } from "./catalog.js";
export function signManifest(manifest, privateKey) {
    return sign(null, Buffer.from(canonicalManifest(manifest), 'utf8'), privateKey).toString('base64');
}
export function verifyManifestSignature(manifest, signature, publicKey) {
    return verify(null, Buffer.from(canonicalManifest(manifest), 'utf8'), publicKey, Buffer.from(signature, 'base64'));
}
export function signTrustMetadata(metadata, privateKey) {
    return sign(null, Buffer.from(canonicalTrustMetadata(metadata), 'utf8'), privateKey).toString('base64');
}
export function verifyTrustMetadataSignature(metadata, signature, publicKey) {
    return verify(null, Buffer.from(canonicalTrustMetadata(metadata), 'utf8'), publicKey, Buffer.from(signature, 'base64'));
}
