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
    const manifest = await this.repository.readManifest();
    if (!manifest) {
      throw new Error('No recordings have been saved yet');
    }
    await this.share.shareText('ColdKeep labels', manifest);
  }
}
