import { CollectSampleUseCase } from '../src/features/collection/application/collectSampleUseCase';
import { RecordingUseCase } from '../src/features/scan/application/recordingUseCase';
import { ScanBottleUseCase } from '../src/features/scan/application/scanBottleUseCase';
import {
  AudioClassifier,
  AudioReader,
  AudioRecorder,
  DatasetRepository,
  MicrophonePermission,
} from '../src/features/shared/application/ports';
import { normalizeScanResult } from '../src/features/scan/domain/scanResult';

const shortAudio = {
  samples: new Float32Array(15_999),
  sampleRate: 16_000,
};

test('recording refuses to access the microphone without permission', async () => {
  const permission: MicrophonePermission = {
    ensure: jest.fn(async () => false),
  };
  const recorder: AudioRecorder = {
    start: jest.fn(),
    stop: jest.fn(),
    cleanup: jest.fn(),
  };
  const useCase = new RecordingUseCase(permission, recorder);

  await expect(useCase.start()).rejects.toThrow('Microphone Permission Required');
  expect(recorder.start).not.toHaveBeenCalled();
});

test('recording coalesces concurrent starts and rejects a second active start', async () => {
  const permission: MicrophonePermission = {
    ensure: jest.fn(async () => true),
  };
  const recording = { uri: 'file:///recording.wav' };
  const recorder: AudioRecorder = {
    start: jest.fn(async () => recording),
    stop: jest.fn(async () => recording),
    cleanup: jest.fn(async () => undefined),
  };
  const useCase = new RecordingUseCase(permission, recorder);

  const firstStart = useCase.start();
  const secondStart = useCase.start();
  await expect(Promise.all([firstStart, secondStart])).resolves.toEqual([
    recording,
    recording,
  ]);
  expect(permission.ensure).toHaveBeenCalledTimes(1);
  expect(recorder.start).toHaveBeenCalledTimes(1);

  await expect(useCase.start()).rejects.toThrow('already in progress');
  expect(recorder.start).toHaveBeenCalledTimes(1);
});

test('scan rejects recordings shorter than one second before classification', async () => {
  const reader: AudioReader = {
    read: jest.fn(async () => shortAudio),
  };
  const classifier: AudioClassifier = {
    classify: jest.fn(),
  };
  const useCase = new ScanBottleUseCase(reader, [classifier]);

  await expect(useCase.execute({ uri: 'file:///short.wav' })).rejects.toThrow(
    'Recording must be at least one second',
  );
  expect(classifier.classify).not.toHaveBeenCalled();
});

test('collection rejects short recordings before persisting labels', async () => {
  const reader: AudioReader = {
    read: jest.fn(async () => shortAudio),
  };
  const repository: DatasetRepository = {
    save: jest.fn(),
    readManifest: jest.fn(),
  };
  const useCase = new CollectSampleUseCase(reader, repository);

  await expect(
    useCase.execute(
      { uri: 'file:///short.wav' },
      {
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
      },
    ),
  ).rejects.toThrow('Recording must be at least one second');
  expect(repository.save).not.toHaveBeenCalled();
});

test('scan result normalization enforces the public result contract', () => {
  expect(
    normalizeScanResult({
      containsWater: false,
      waterConfidence: 2,
      fillLevel: 90,
      fillConfidence: 0.9,
      icePresence: true,
      iceConfidence: 2,
      iceStatus: 'untrained',
      engine: 'typescript',
    }),
  ).toEqual({
    containsWater: false,
    waterConfidence: 1,
    fillLevel: null,
    fillConfidence: null,
    icePresence: true,
    iceConfidence: 1,
    iceStatus: 'untrained',
    engine: 'typescript',
  });
});
