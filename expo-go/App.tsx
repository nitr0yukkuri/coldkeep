import React, { useEffect, useMemo, useRef } from 'react';
import { useAudioStream, setAudioModeAsync } from 'expo-audio';

import ColdKeepScreen from '../App';
import { CollectionScreen } from '../src/features/collection/ui/CollectionScreen';
import { isCollectionMode } from '../src/app/runtimeMode';
import { createExpoAppDependencies } from './src/compositionRoot';
import { ExpoPcmRecorderAdapter } from './src/audioAdapters';

export default function ExpoGoApp() {
  const recorderRef = useRef<ExpoPcmRecorderAdapter | null>(null);
  const streamResult = useAudioStream({
    channels: 1,
    encoding: 'int16',
    sampleRate: 16_000,
    onBuffer: buffer => recorderRef.current?.append(buffer),
  });
  const recorder = useMemo(() => {
    const nextRecorder = new ExpoPcmRecorderAdapter(streamResult.stream);
    recorderRef.current = nextRecorder;
    return nextRecorder;
  }, [streamResult.stream]);
  const app = useMemo(() => createExpoAppDependencies(recorder), [recorder]);

  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    }).catch(error => {
      console.warn('Unable to configure the Expo audio session', error);
    });
    return () => {
      streamResult.stream.stop();
      recorderRef.current = null;
    };
  }, [streamResult.stream]);

  return isCollectionMode ? (
    <CollectionScreen app={app} />
  ) : (
    <ColdKeepScreen app={app} />
  );
}
