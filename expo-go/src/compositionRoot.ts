import { CollectSampleUseCase } from '../../src/features/collection/application/collectSampleUseCase';
import { ExportDatasetUseCase } from '../../src/features/collection/application/exportDatasetUseCase';
import { RecordingUseCase } from '../../src/features/scan/application/recordingUseCase';
import { ScanBottleUseCase } from '../../src/features/scan/application/scanBottleUseCase';
import { HydrationUseCase } from '../../src/features/hydration/application/hydrationUseCase';
import { COLLECTION_ACTIONS } from '../../src/features/collection/domain/collection';
import type { AppDependencies } from '../../src/app/types';
import { TypeScriptClassifierAdapter } from '../../src/platform/ml/typescriptClassifier';
import { ExpoShareGateway } from './shareGateway';
import {
  ExpoAudioReader,
  ExpoMicrophonePermission,
  ExpoPcmRecorderAdapter,
} from './audioAdapters';
import { ExpoDatasetRepository } from './datasetRepository';
import { ExpoHydrationRepository } from './hydrationRepository';
import { MODEL_RECORDING_ACTION } from '../../src/features/collection/domain/collection';
import { isResearchPreviewMode } from '../../src/app/runtimeMode';
import { NotificationUseCase } from '../../src/features/notifications/application/notificationUseCase';
import { ExpoNotificationScheduler } from './notifications';

export function createExpoAppDependencies(
  recorder: ExpoPcmRecorderAdapter,
): AppDependencies {
  const reader = new ExpoAudioReader();
  const repository = new ExpoDatasetRepository();
  const shakeOptions = {
    allowExperimentalPreview: isResearchPreviewMode,
    allowExperimentalIcePreview: isResearchPreviewMode,
  };
  return {
    collectionActions: COLLECTION_ACTIONS,
    recording: new RecordingUseCase(new ExpoMicrophonePermission(), recorder),
    scan: new ScanBottleUseCase(
      reader,
      [
        new TypeScriptClassifierAdapter(shakeOptions),
      ],
      MODEL_RECORDING_ACTION,
      { allowExperimentalIceAmount: isResearchPreviewMode },
    ),
    collect: new CollectSampleUseCase(reader, repository),
    exportDataset: new ExportDatasetUseCase(
      repository,
      new ExpoShareGateway(),
    ),
    hydration: new HydrationUseCase(new ExpoHydrationRepository()),
    notifications: new NotificationUseCase(new ExpoNotificationScheduler()),
  };
}
