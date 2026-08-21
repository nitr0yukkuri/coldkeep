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

  await expect(useCase.start()).rejects.toThrow(
    'Microphone Permission Required',
  );
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

test('recording clears active state when native stop fails so retry is possible', async () => {
  const permission: MicrophonePermission = {
    ensure: jest.fn(async () => true),
  };
  const recording = { uri: 'file:///recording.wav' };
  const recorder: AudioRecorder = {
    start: jest.fn(async () => recording),
    stop: jest
      .fn()
      .mockRejectedValueOnce(new Error('native stop failed'))
      .mockResolvedValueOnce(recording),
    cleanup: jest.fn(async () => undefined),
  };
  const useCase = new RecordingUseCase(permission, recorder);

  await useCase.start();
  await expect(useCase.stop()).rejects.toThrow('native stop failed');
  await expect(useCase.start()).resolves.toEqual(recording);
  await expect(useCase.stop()).resolves.toEqual(recording);
  expect(recorder.start).toHaveBeenCalledTimes(2);
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

test('scan rejects empty or invalid PCM before classification', async () => {
  const reader: AudioReader = {
    read: jest.fn(async () => ({ samples: new Float32Array(), sampleRate: 0 })),
  };
  const classifier: AudioClassifier = { classify: jest.fn() };
  const useCase = new ScanBottleUseCase(reader, [classifier]);

  await expect(useCase.execute({ uri: 'file:///empty.wav' })).rejects.toThrow(
    'Recording contains invalid PCM audio',
  );
  expect(classifier.classify).not.toHaveBeenCalled();
});

test('scan rejects a silent recording before classification', async () => {
  const reader: AudioReader = {
    read: jest.fn(async () => ({
      samples: new Float32Array(16_000),
      sampleRate: 16_000,
    })),
  };
  const classifier: AudioClassifier = { classify: jest.fn() };
  const useCase = new ScanBottleUseCase(reader, [classifier]);

  await expect(useCase.execute({ uri: 'file:///silent.wav' })).rejects.toThrow(
    '有効な音声信号がありません。水筒へ水を注ぐ音を録音してください',
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
    createExportArchive: jest.fn(),
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

test('collection rejects invalid PCM before persisting labels', async () => {
  const reader: AudioReader = {
    read: jest.fn(async () => ({ samples: new Float32Array(), sampleRate: 0 })),
  };
  const repository: DatasetRepository = {
    save: jest.fn(),
    readManifest: jest.fn(),
    createExportArchive: jest.fn(),
  };
  const useCase = new CollectSampleUseCase(reader, repository);

  await expect(
    useCase.execute(
      { uri: 'file:///empty.wav' },
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
  ).rejects.toThrow('Recording contains invalid PCM audio');
  expect(repository.save).not.toHaveBeenCalled();
});

test('collection rejects a silent recording before persisting labels', async () => {
  const reader: AudioReader = {
    read: jest.fn(async () => ({
      samples: new Float32Array(16_000),
      sampleRate: 16_000,
    })),
  };
  const repository: DatasetRepository = {
    save: jest.fn(),
    readManifest: jest.fn(),
    createExportArchive: jest.fn(),
  };
  const useCase = new CollectSampleUseCase(reader, repository);

  await expect(
    useCase.execute(
      { uri: 'file:///silent.wav' },
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
  ).rejects.toThrow(
    '有効な音声信号がありません。ラベルに対応する音を録音してください',
  );
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
      iceAmount: null,
      iceAmountConfidence: null,
      iceAmountStatus: 'untrained',
      engine: 'typescript',
    }),
  ).toEqual({
    containsWater: false,
    waterConfidence: 1,
    fillLevel: null,
    fillConfidence: null,
    icePresence: null,
    iceConfidence: null,
    iceStatus: 'untrained',
    iceAmount: null,
    iceAmountConfidence: null,
    iceAmountStatus: 'untrained',
    engine: 'typescript',
    measurementAction: 'pour',
    measurementStatus: 'untrained',
  });
});

test('scan result normalization hides untrained or low-confidence ice claims', () => {
  expect(
    normalizeScanResult({
      containsWater: true,
      waterConfidence: 0.9,
      fillLevel: 50,
      fillConfidence: 0.9,
      icePresence: true,
      iceConfidence: 0.9,
      iceStatus: 'untrained',
      iceAmount: 'many',
      iceAmountConfidence: 0.9,
      iceAmountStatus: 'untrained',
      engine: 'typescript',
    }).icePresence,
  ).toBeNull();
  expect(
    normalizeScanResult({
      containsWater: true,
      waterConfidence: 0.9,
      fillLevel: 50,
      fillConfidence: 0.9,
      icePresence: true,
      iceConfidence: 0.64,
      iceStatus: 'trained',
      iceAmount: 'few',
      iceAmountConfidence: 0.64,
      iceAmountStatus: 'trained',
      engine: 'typescript',
    }).icePresence,
  ).toBeNull();
  expect(
    normalizeScanResult({
      containsWater: true,
      waterConfidence: 0.9,
      fillLevel: 50,
      fillConfidence: 0.9,
      icePresence: false,
      iceConfidence: 0.65,
      iceStatus: 'trained',
      iceAmount: 'none',
      iceAmountConfidence: 0.65,
      iceAmountStatus: 'trained',
      engine: 'typescript',
    }).icePresence,
  ).toBe(false);
});
