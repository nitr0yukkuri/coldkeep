import { CollectSampleUseCase } from '../../src/features/collection/application/collectSampleUseCase';
import { ExportDatasetUseCase } from '../../src/features/collection/application/exportDatasetUseCase';
import { RecordingUseCase } from '../../src/features/scan/application/recordingUseCase';
import { ScanBottleUseCase } from '../../src/features/scan/application/scanBottleUseCase';
import { COLLECTION_ACTIONS } from '../../src/features/collection/domain/collection';
import type { AppDependencies } from '../../src/app/types';
import { TypeScriptClassifierAdapter } from '../../src/platform/ml/typescriptClassifier';
import { ReactNativeShareGateway } from '../../src/platform/sharing/reactNativeShareGateway';
import {
  ExpoAudioReader,
  ExpoMicrophonePermission,
  ExpoPcmRecorderAdapter,
} from './audioAdapters';
import { ExpoDatasetRepository } from './datasetRepository';

export function createExpoAppDependencies(
  recorder: ExpoPcmRecorderAdapter,
): AppDependencies {
  const reader = new ExpoAudioReader();
  const repository = new ExpoDatasetRepository();
  return {
    collectionActions: COLLECTION_ACTIONS,
    recording: new RecordingUseCase(new ExpoMicrophonePermission(), recorder),
    scan: new ScanBottleUseCase(reader, [new TypeScriptClassifierAdapter()]),
    collect: new CollectSampleUseCase(reader, repository),
    exportDataset: new ExportDatasetUseCase(
      repository,
      new ReactNativeShareGateway(),
    ),
  };
}
