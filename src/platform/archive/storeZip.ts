/* eslint-disable no-bitwise */

export type StoreZipFile = {
  name: string;
  base64: string;
};

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeUtf8(value: string): Uint8Array {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }
  return new Uint8Array(bytes);
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s/g, '').replace(new RegExp('=+$'), '');
  const output = new Uint8Array(Math.floor((normalized.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const character of normalized) {
    const digit = BASE64.indexOf(character);
    if (digit < 0) {
      throw new Error('Invalid base64 data in dataset export');
    }
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }
  return output;
}

export function encodeBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += BASE64[first >> 2];
    result += BASE64[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    result +=
      second === undefined
        ? '=='
        : BASE64[((second & 0x0f) << 2) | ((third ?? 0) >> 6)] +
          (third === undefined ? '=' : BASE64[third & 0x3f]);
  }
  return result;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeU32(target: number[], value: number): void {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function writeBytes(target: number[], bytes: Uint8Array): void {
  for (const byte of bytes) {
    target.push(byte);
  }
}

/** Creates a standards-compliant ZIP using the store method (no compression).
 * Keeping compression out of the app avoids platform-specific native modules;
 * Python/Rust tooling can decompress the resulting archive normally. */
export function createStoreZipBase64(files: readonly StoreZipFile[]): string {
  if (files.length === 0) {
    throw new Error('Cannot export an empty dataset');
  }
  const output: number[] = [];
  const centralDirectory: number[] = [];
  const entries: Array<{ name: Uint8Array; data: Uint8Array; offset: number }> =
    [];

  for (const file of files) {
    const name = encodeUtf8(file.name.replace(/^\/+/, ''));
    const data = decodeBase64(file.base64);
    const offset = output.length;
    const checksum = crc32(data);
    writeU32(output, 0x04034b50);
    writeU16(output, 20);
    writeU16(output, 0);
    writeU16(output, 0);
    writeU16(output, 0);
    writeU16(output, 0);
    writeU32(output, checksum);
    writeU32(output, data.length);
    writeU32(output, data.length);
    writeU16(output, name.length);
    writeU16(output, 0);
    writeBytes(output, name);
    writeBytes(output, data);
    entries.push({ name, data, offset });
  }

  const centralOffset = output.length;
  for (const entry of entries) {
    const checksum = crc32(entry.data);
    writeU32(centralDirectory, 0x02014b50);
    writeU16(centralDirectory, 20);
    writeU16(centralDirectory, 20);
    writeU16(centralDirectory, 0);
    writeU16(centralDirectory, 0);
    writeU16(centralDirectory, 0);
    writeU16(centralDirectory, 0);
    writeU32(centralDirectory, checksum);
    writeU32(centralDirectory, entry.data.length);
    writeU32(centralDirectory, entry.data.length);
    writeU16(centralDirectory, entry.name.length);
    writeU16(centralDirectory, 0);
    writeU16(centralDirectory, 0);
    writeU16(centralDirectory, 0);
    writeU16(centralDirectory, 0);
    writeU32(centralDirectory, 0);
    writeU32(centralDirectory, entry.offset);
    writeBytes(centralDirectory, entry.name);
  }
  writeBytes(output, new Uint8Array(centralDirectory));
  writeU32(output, 0x06054b50);
  writeU16(output, 0);
  writeU16(output, 0);
  writeU16(output, entries.length);
  writeU16(output, entries.length);
  writeU32(output, centralDirectory.length);
  writeU32(output, centralOffset);
  writeU16(output, 0);
  return encodeBase64(new Uint8Array(output));
}
