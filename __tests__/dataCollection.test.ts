import {
  COLLECTION_CSV_HEADER,
  CollectionDraft,
  collectionRecordToCsv,
  collectionExportFileNames,
  createRecordingId,
  normalizeCollectionManifest,
  validateCollectionDraft,
} from '../dataCollection';

const validDraft: CollectionDraft = {
  sessionId: 'session-01',
  containerId: 'bottle-A',
  deviceId: 'pixel-7',
  capacityMl: '500',
  waterMl: '250',
  iceCount: '3',
  iceMassG: '45.5',
  temperatureC: '6.2',
  microphoneDistanceCm: '10',
  action: 'shake',
};

test('validates and normalizes collection labels', () => {
  expect(validateCollectionDraft(validDraft)).toEqual({
    sessionId: 'session-01',
    containerId: 'bottle-A',
    deviceId: 'pixel-7',
    capacityMl: 500,
    waterMl: 250,
    iceCount: 3,
    iceMassG: 45.5,
    temperatureC: 6.2,
    microphoneDistanceCm: 10,
    action: 'shake',
  });
});
test('rejects physically inconsistent labels', () => {
  expect(() =>
    validateCollectionDraft({ ...validDraft, waterMl: '600' }),
  ).toThrow('Water amount cannot exceed container capacity');
  expect(() =>
    validateCollectionDraft({ ...validDraft, iceCount: '0' }),
  ).toThrow('Ice count and ice mass');
});

test('creates filesystem-safe deterministic recording IDs', () => {
  expect(
    createRecordingId(
      { sessionId: 'day 1', containerId: 'cup/large' },
      new Date('2026-07-29T01:02:03.456Z'),
    ),
  ).toBe('20260729010203456_day-1_cup-large');
});

test('escapes CSV metadata', () => {
  const row = collectionRecordToCsv({
    ...validateCollectionDraft({ ...validDraft, deviceId: 'phone, primary' }),
    recordingId: 'recording-1',
    labelSource: 'coldkeep_measured',
    recordedAt: '2026-07-29T01:02:03.456Z',
    audioFilename: 'audio/recording-1.wav',
    sampleRateHz: 16000,
    channels: 1,
    bitDepth: 16,
    durationSeconds: 2.3456,
    platform: 'android',
  });
  expect(COLLECTION_CSV_HEADER.split(',')).toHaveLength(19);
  expect(row).toContain('"phone, primary"');
  expect(row).toContain('2.346');
});

test('rejects platform names as device IDs', () => {
  expect(() =>
    validateCollectionDraft({ ...validDraft, deviceId: 'android' }),
  ).toThrow('stable, operator-entered identifier');
});

test('rejects an unknown collection action at the runtime boundary', () => {
  expect(() =>
    validateCollectionDraft({
      ...validDraft,
      action: 'record' as CollectionDraft['action'],
    }),
  ).toThrow('Action must be pour, shake, or still');
});

test('collection manifest rejects a stale schema before appending rows', () => {
  expect(normalizeCollectionManifest(null)).toBe(COLLECTION_CSV_HEADER);
  expect(() => normalizeCollectionManifest('recording_id,old_schema\n')).toThrow(
    'manifest schema mismatch',
  );
});

test('export whitelist follows manifest rows and rejects path traversal', () => {
  const row = collectionRecordToCsv({
    ...validateCollectionDraft(validDraft),
    recordingId: 'recording-1',
    labelSource: 'coldkeep_measured',
    recordedAt: '2026-07-29T01:02:03.456Z',
    audioFilename: 'audio/recording-1.wav',
    sampleRateHz: 16000,
    channels: 1,
    bitDepth: 16,
    durationSeconds: 1,
    platform: 'android',
  });
  expect(collectionExportFileNames(`${COLLECTION_CSV_HEADER}\n${row}\n`)).toEqual(
    new Set(['manifest.csv', 'audio/recording-1.wav', 'metadata/recording-1.json']),
  );
  expect(() =>
    collectionExportFileNames(
      `${COLLECTION_CSV_HEADER}\n${row.replace(
        'audio/recording-1.wav',
        'audio/../secret.wav',
      )}\n`,
    ),
  ).toThrow('invalid audio_filename');
});
