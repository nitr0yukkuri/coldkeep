import {
  DatasetRepository,
  ShareGateway,
} from '../../shared/application/ports';

export class ExportDatasetUseCase {
  constructor(
    private readonly repository: DatasetRepository,
    private readonly share: ShareGateway,
  ) {}

  async execute(): Promise<void> {
    const archiveUri = await this.repository.createExportArchive();
    await this.share.shareFile('ColdKeep dataset', archiveUri);
  }
}
