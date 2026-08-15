import { CollectSampleUseCase } from '../src/features/collection/application/collectSampleUseCase';
import { ExportDatasetUseCase } from '../src/features/collection/application/exportDatasetUseCase';
import { RecordingUseCase } from '../src/features/scan/application/recordingUseCase';
import { ScanBottleUseCase } from '../src/features/scan/application/scanBottleUseCase';
import {
  AudioClassifier,
  AudioReader,
  AudioRecorder,
  DatasetRepository,
  MicrophonePermission,
  ShareGateway,
} from '../src/features/shared/application/ports';
import { ScanResult } from '../src/features/scan/domain/scanResult';
import { CollectionLabels } from '../dataCollection';

const audio = {
  samples: Float32Array.from({ length: 16_000 }, (_, index) =>
    0.05 * Math.sin((2 * Math.PI * 700 * index) / 16_000),
  ),
  sampleRate: 16_000,
};

const labels: CollectionLabels = {
  sessionId: 'session-01',
  containerId: 'bottle-01',
  deviceId: 'test-device',
  capacityMl: 500,
  waterMl: 250,
  iceCount: 0,
  iceMassG: 0,
  temperatureC: 20,
  microphoneDistanceCm: 10,
  action: 'shake',
};

const result: ScanResult = {
  containsWater: true,
  waterConfidence: 0.9,
  fillLevel: 50,
  fillConfidence: 0.8,
  icePresence: null,
  iceConfidence: null,
  iceStatus: 'untrained',
  engine: 'typescript',
};

test('recording use case owns permission and recorder sequencing', async () => {
  const permission: MicrophonePermission = { ensure: jest.fn(async () => true) };
  const recorder: AudioRecorder = {
    start: jest.fn(async () => ({ uri: 'file:///recording.wav' })),
    stop: jest.fn(async () => ({ uri: 'file:///recording.wav' })),
    cleanup: jest.fn(async () => undefined),
  };
  const useCase = new RecordingUseCase(permission, recorder);

  await expect(useCase.start()).resolves.toEqual({ uri: 'file:///recording.wav' });
  await expect(useCase.stop()).resolves.toEqual({ uri: 'file:///recording.wav' });
  expect(permission.ensure).toHaveBeenCalledTimes(1);
  expect(recorder.start).toHaveBeenCalledTimes(1);
});

test('scan use case falls back across classifier adapters', async () => {
  const reader: AudioReader = { read: jest.fn(async () => audio) };
  const failingClassifier: AudioClassifier = {
    classify: jest.fn(async () => {
      throw new Error('Rust unavailable');
    }),
  };
  const fallbackClassifier: AudioClassifier = {
    classify: jest.fn(async () => result),
  };
  const useCase = new ScanBottleUseCase(reader, [
    failingClassifier,
    fallbackClassifier,
  ]);

  await expect(useCase.execute({ uri: 'file:///recording.wav' })).resolves.toEqual(result);
  expect(failingClassifier.classify).toHaveBeenCalledTimes(1);
  expect(fallbackClassifier.classify).toHaveBeenCalledTimes(1);
});

test('collection and export use cases depend on ports, not RNFS', async () => {
  const reader: AudioReader = { read: jest.fn(async () => audio) };
  const record = {
    ...labels,
    recordingId: 'recording-1',
    recordedAt: '2026-08-09T00:00:00.000Z',
    audioFilename: 'audio/recording-1.wav',
    sampleRateHz: 16_000,
    channels: 1,
    bitDepth: 16,
    durationSeconds: 1,
    platform: 'android',
  };
  const repository: DatasetRepository = {
    save: jest.fn(async () => record),
    readManifest: jest.fn(async () => 'header\nrow'),
  };
  const share: ShareGateway = { shareText: jest.fn(async () => undefined) };
  const collect = new CollectSampleUseCase(reader, repository);
  const exportDataset = new ExportDatasetUseCase(repository, share);

  await expect(
    collect.execute({ uri: 'file:///recording.wav' }, labels),
  ).resolves.toEqual(record);
  await expect(exportDataset.execute()).resolves.toBeUndefined();
  expect(repository.save).toHaveBeenCalledTimes(1);
  expect(share.shareText).toHaveBeenCalledWith('ColdKeep labels', 'header\nrow');
});
