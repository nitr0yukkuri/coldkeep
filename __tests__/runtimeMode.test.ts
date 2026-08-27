declare const process: { env: Record<string, string | undefined> };

describe('runtime demo mode', () => {
  const originalAppMode = process.env.EXPO_PUBLIC_APP_MODE;
  const originalMlPreview = process.env.EXPO_PUBLIC_ML_PREVIEW;

  afterEach(() => {
    if (originalAppMode === undefined) {
      delete process.env.EXPO_PUBLIC_APP_MODE;
    } else {
      process.env.EXPO_PUBLIC_APP_MODE = originalAppMode;
    }
    if (originalMlPreview === undefined) {
      delete process.env.EXPO_PUBLIC_ML_PREVIEW;
    } else {
      process.env.EXPO_PUBLIC_ML_PREVIEW = originalMlPreview;
    }
    jest.resetModules();
  });

  function loadRuntimeMode() {
    let runtime!: typeof import('../src/app/runtimeMode');
    jest.isolateModules(() => {
      runtime = require('../src/app/runtimeMode');
    });
    return runtime;
  }

  test('keeps research inference disabled for a normal build', () => {
    delete process.env.EXPO_PUBLIC_APP_MODE;
    delete process.env.EXPO_PUBLIC_ML_PREVIEW;

    const runtime = loadRuntimeMode();

    expect(runtime.isDemoMode).toBe(false);
    expect(runtime.isResearchPreviewMode).toBe(false);
    expect(runtime.isResearchPreviewEnabled).toBe(false);
  });

  test('enables research inference only for an explicit demo build', () => {
    process.env.EXPO_PUBLIC_APP_MODE = 'demo';
    delete process.env.EXPO_PUBLIC_ML_PREVIEW;

    const runtime = loadRuntimeMode();

    expect(runtime.isDemoMode).toBe(true);
    expect(runtime.isResearchPreviewEnabled).toBe(true);
  });

  test('keeps the existing explicit research preview opt-in', () => {
    delete process.env.EXPO_PUBLIC_APP_MODE;
    process.env.EXPO_PUBLIC_ML_PREVIEW = 'research';

    const runtime = loadRuntimeMode();

    expect(runtime.isDemoMode).toBe(false);
    expect(runtime.isResearchPreviewMode).toBe(true);
    expect(runtime.isResearchPreviewEnabled).toBe(true);
  });
});

