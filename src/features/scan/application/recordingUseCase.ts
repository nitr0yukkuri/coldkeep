import {
  AudioRecorder,
  MicrophonePermission,
  RecordingRef,
} from '../../shared/application/ports';

export class RecordingUseCase {
  constructor(
    private readonly permission: MicrophonePermission,
    private readonly recorder: AudioRecorder,
  ) {}

  async start(): Promise<RecordingRef> {
    if (!(await this.permission.ensure())) {
      throw new Error('Microphone Permission Required');
    }
    return this.recorder.start();
  }

  stop(): Promise<RecordingRef> {
    return this.recorder.stop();
  }

  cleanup(recording: RecordingRef): Promise<void> {
    return this.recorder.cleanup(recording);
  }
}
