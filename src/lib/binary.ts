/**
 * base64 for payloads that cross the bridge.
 *
 * `String.fromCharCode(...bytes)` is the obvious way to do both directions and
 * it breaks on anything large: a 12 MB image becomes twelve million arguments
 * and the call stack gives out. Both functions walk the payload in chunks, which
 * is why they live here rather than inline in a view.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}
