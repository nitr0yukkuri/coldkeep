import { ExportDatasetUseCase } from '../features/collection/application/exportDatasetUseCase';
import { CollectSampleUseCase } from '../features/collection/application/collectSampleUseCase';
import { RecordingUseCase } from '../features/scan/application/recordingUseCase';
import { ScanBottleUseCase } from '../features/scan/application/scanBottleUseCase';
import { AndroidMicrophonePermission } from '../platform/android/microphonePermission';
import { NativeWavRecorderAdapter } from '../platform/android/nativeWavRecorder';
import { RnfsWavReader } from '../platform/audio/rnfsWavReader';
import { RustClassifierAdapter } from '../platform/ml/rustClassifier';
import { TypeScriptClassifierAdapter } from '../platform/ml/typescriptClassifier';
import { RnfsDatasetRepository } from '../platform/storage/rnfsDatasetRepository';
import { ReactNativeShareGateway } from '../platform/sharing/reactNativeShareGateway';

export function createAppDependencies() {
  const recorder = new NativeWavRecorderAdapter();
  const recording = new RecordingUseCase(
    new AndroidMicrophonePermission(),
    recorder,
  );
  const reader = new RnfsWavReader();
  const repository = new RnfsDatasetRepository();

  return {
    collectionActions: ['pour', 'shake', 'still'] as const,
    recording,
    scan: new ScanBottleUseCase(reader, [
      new RustClassifierAdapter(),
      new TypeScriptClassifierAdapter(),
    ]),
    collect: new CollectSampleUseCase(reader, repository),
    exportDataset: new ExportDatasetUseCase(
      repository,
      new ReactNativeShareGateway(),
    ),
  };
}
