import { createStoreZipBase64 } from '../src/platform/archive/storeZip';

test('creates a readable store-only ZIP with nested dataset files', () => {
  const archive = createStoreZipBase64([
    { name: 'manifest.csv', base64: 'aWQKMQo=' },
    { name: 'audio/example.wav', base64: 'AAECAw==' },
  ]);

  expect(archive.startsWith('UEsDB')).toBe(true);
  expect(archive).toContain('UEsFBg');
  expect(archive.length).toBeGreaterThan(100);
});
