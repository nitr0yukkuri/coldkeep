import {
  createStoreZipBase64,
  encodeBase64,
  writeStoreZipArchive,
} from '../src/platform/archive/storeZip';

test('creates a readable store-only ZIP with nested dataset files', () => {
  const archive = createStoreZipBase64([
    { name: 'manifest.csv', base64: 'aWQKMQo=' },
    { name: 'audio/example.wav', base64: 'AAECAw==' },
  ]);

  expect(archive.startsWith('UEsDB')).toBe(true);
  expect(archive).toContain('UEsFBg');
  expect(archive.length).toBeGreaterThan(100);
});

test('streaming ZIP writer matches the bounded in-memory writer', async () => {
  const files = [
    { name: 'manifest.csv', base64: 'aWQKMQo=' },
    { name: 'audio/example.wav', base64: 'AAECAw==' },
  ];
  const chunks: Uint8Array[] = [];
  await writeStoreZipArchive(
    files.map(file => ({
      name: file.name,
      readBase64: async () => file.base64,
    })),
    {
      write: bytes => {
        chunks.push(bytes);
      },
    },
  );
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  chunks.forEach(chunk => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  expect(encodeBase64(bytes)).toBe(createStoreZipBase64(files));
});

test('ZIP writers reject traversal and duplicate entry names', () => {
  expect(() =>
    createStoreZipBase64([{ name: '../secret.txt', base64: 'AA==' }]),
  ).toThrow('Invalid ZIP entry name');
  expect(() =>
    createStoreZipBase64([
      { name: 'manifest.csv', base64: 'AA==' },
      { name: 'manifest.csv', base64: 'AA==' },
    ]),
  ).toThrow('Duplicate ZIP entry name');
  expect(() =>
    createStoreZipBase64([{ name: '/absolute.txt', base64: 'AA==' }]),
  ).toThrow('Invalid ZIP entry name');
});
