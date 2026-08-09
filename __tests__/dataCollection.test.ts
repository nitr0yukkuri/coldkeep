import {
  COLLECTION_CSV_HEADER,
  CollectionDraft,
  collectionRecordToCsv,
  createRecordingId,
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
    recordedAt: '2026-07-29T01:02:03.456Z',
    audioFilename: 'audio/recording-1.wav',
    sampleRateHz: 16000,
    channels: 1,
    bitDepth: 16,
    durationSeconds: 2.3456,
    platform: 'android',
  });
  expect(COLLECTION_CSV_HEADER.split(',')).toHaveLength(18);
  expect(row).toContain('"phone, primary"');
  expect(row).toContain('2.346');
});
