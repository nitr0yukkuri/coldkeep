import type { ExportDatasetUseCase } from '../features/collection/application/exportDatasetUseCase';
import type { CollectSampleUseCase } from '../features/collection/application/collectSampleUseCase';
import type { CollectionAction } from '../features/collection/domain/collection';
import type { RecordingUseCase } from '../features/scan/application/recordingUseCase';
import type { ScanBottleUseCase } from '../features/scan/application/scanBottleUseCase';
import type { HydrationUseCase } from '../features/hydration/application/hydrationUseCase';
import type { NotificationUseCase } from '../features/notifications/application/notificationUseCase';

export type AppDependencies = {
  collectionActions: readonly CollectionAction[];
  recording: RecordingUseCase;
  scan: ScanBottleUseCase;
  collect: CollectSampleUseCase;
  exportDataset: ExportDatasetUseCase;
  hydration: HydrationUseCase;
  notifications?: NotificationUseCase;
};
