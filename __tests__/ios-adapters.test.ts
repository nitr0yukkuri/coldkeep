import { NativeModules } from 'react-native';

jest.mock('react-native-fs', () => ({
  unlink: jest.fn(),
}));

import { IOSMicrophonePermission } from '../src/platform/ios/microphonePermission';
import { IOSWavRecorderAdapter } from '../src/platform/ios/nativeWavRecorder';

const nativeRecorder = {
  requestPermission: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};

describe('iOS native adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (NativeModules as { ColdKeepAudioRecorder?: unknown }).ColdKeepAudioRecorder =
      nativeRecorder;
  });

  it('requests microphone permission through the Swift module', async () => {
    nativeRecorder.requestPermission.mockResolvedValue(true);

    await expect(new IOSMicrophonePermission().ensure()).resolves.toBe(true);
    expect(nativeRecorder.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('adapts native recording URLs to the shared port', async () => {
    nativeRecorder.start.mockResolvedValue(
      'file:///tmp/coldkeep-start.wav',
    );
    nativeRecorder.stop.mockResolvedValue('file:///tmp/coldkeep-stop.wav');
    const adapter = new IOSWavRecorderAdapter();

    await expect(adapter.start()).resolves.toEqual({
      uri: 'file:///tmp/coldkeep-start.wav',
    });
    await expect(adapter.stop()).resolves.toEqual({
      uri: 'file:///tmp/coldkeep-stop.wav',
    });
  });
});
