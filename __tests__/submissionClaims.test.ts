declare const __dirname: string;

type NodeFs = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding?: 'utf8'): string | Uint8Array;
};

type NodeCrypto = {
  createHash(algorithm: string): {
    update(value: Uint8Array): { digest(encoding: 'hex'): string };
  };
};

const { existsSync, readFileSync } = require('fs') as NodeFs;
const { createHash } = require('crypto') as NodeCrypto;
const { join } = require('path') as { join(...paths: string[]): string };

const root = join(__dirname, '..');

function readDocument(name: string): string {
  return readFileSync(join(root, name), 'utf8') as string;
}

describe('U-22 submission claim boundaries', () => {
  test('public documents keep the evaluated action and unsupported outputs aligned', () => {
    const documents = [
      'README.md',
      'SUBMISSION_README.md',
      'U22_APPLICATION_DRAFT.md',
      'U22_PROTOPEDIA_DRAFT.md',
      'U22_VIDEO_SCRIPT.md',
    ].map(readDocument);
    const combined = documents.join('\n');

    expect(combined).toContain('振った音');
    expect(combined).toContain('未学習');
    expect(combined).toContain('氷');
    expect(combined).toContain('未判定');
    expect(combined).toContain('熱中症の診断');
    expect(combined).not.toMatch(/振る音から.*(?:測定|推定)できる(?:ようになった|ようになります)/);
    expect(combined).not.toMatch(/氷の(?:重量|個数|量|温度)を(?:測定|推定)できる/);
  });

  test('handoff explicitly keeps physical evidence pending until captured', () => {
    const plan = readDocument('U22_SUBMISSION_PLAN.md');
    const handoff = readDocument('U22_FINAL_HANDOFF.md');

    expect(plan).toContain('Android実機で証拠作成が必要');
    expect(plan).toContain('実水筒を使った実機3回の推論結果は未確認');
    expect(handoff).toContain('実機確認が終わる前に、実機動作済みとは記載しない');
  });

  test('local preview hash is truthful whenever the generated APK is present', () => {
    const apk = join(root, 'output', 'ColdKeep-u22-current-preview.apk');
    if (!existsSync(apk)) {
      return;
    }

    const handoff = readDocument('U22_FINAL_HANDOFF.md');
    const documented = handoff.match(/ローカルAPK SHA-256[^`]*`([A-F0-9]{64})`/i)?.[1];
    expect(documented).toBeDefined();

    const actual = createHash('sha256')
      .update(readFileSync(apk) as Uint8Array)
      .digest('hex');
    expect(actual.toUpperCase()).toBe(documented?.toUpperCase());
  });
});
