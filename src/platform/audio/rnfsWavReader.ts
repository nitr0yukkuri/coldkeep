import * as RNFS from 'react-native-fs';

import { parsePcm16Wav } from '../../../audioProcessing';
import {
  AudioReader,
  RecordingRef,
} from '../../features/shared/application/ports';

function localPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

export class RnfsWavReader implements AudioReader {
  async read(recording: RecordingRef) {
    if (recording.audio) {
      return recording.audio;
    }
    const base64 = await RNFS.readFile(localPath(recording.uri), 'base64');
    return parsePcm16Wav(base64);
  }
}

export { localPath };
