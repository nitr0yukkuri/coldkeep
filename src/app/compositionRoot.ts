import { ExportDatasetUseCase } from '../features/collection/application/exportDatasetUseCase';
import { CollectSampleUseCase } from '../features/collection/application/collectSampleUseCase';
import { RecordingUseCase } from '../features/scan/application/recordingUseCase';
import { ScanBottleUseCase } from '../features/scan/application/scanBottleUseCase';
import { Platform } from 'react-native';
import { AndroidMicrophonePermission } from '../platform/android/microphonePermission';
import { NativeWavRecorderAdapter } from '../platform/android/nativeWavRecorder';
import { RnfsWavReader } from '../platform/audio/rnfsWavReader';
import { IOSMicrophonePermission } from '../platform/ios/microphonePermission';
import { IOSWavRecorderAdapter } from '../platform/ios/nativeWavRecorder';
import { RustClassifierAdapter } from '../platform/ml/rustClassifier';
import { TypeScriptClassifierAdapter } from '../platform/ml/typescriptClassifier';
import { RnfsDatasetRepository } from '../platform/storage/rnfsDatasetRepository';
import { ReactNativeShareGateway } from '../platform/sharing/reactNativeShareGateway';
import {
  COLLECTION_ACTIONS,
  MODEL_RECORDING_ACTION,
} from '../features/collection/domain/collection';
import { HydrationUseCase } from '../features/hydration/application/hydrationUseCase';
import { RnfsHydrationRepository } from '../platform/storage/rnfsHydrationRepository';

export function createAppDependencies() {
  const recorder =
    Platform.OS === 'ios'
      ? new IOSWavRecorderAdapter()
      : new NativeWavRecorderAdapter();
  const recording = new RecordingUseCase(
    Platform.OS === 'ios'
      ? new IOSMicrophonePermission()
      : new AndroidMicrophonePermission(),
    recorder,
  );
  const reader = new RnfsWavReader();
  const repository = new RnfsDatasetRepository();

  return {
    collectionActions: COLLECTION_ACTIONS,
    recording,
    scan: new ScanBottleUseCase(
      reader,
      [new RustClassifierAdapter(), new TypeScriptClassifierAdapter()],
      MODEL_RECORDING_ACTION,
    ),
    collect: new CollectSampleUseCase(reader, repository),
    exportDataset: new ExportDatasetUseCase(
      repository,
      new ReactNativeShareGateway(),
    ),
    hydration: new HydrationUseCase(new RnfsHydrationRepository()),
  };
}
