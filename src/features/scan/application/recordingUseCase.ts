import {
  AudioRecorder,
  MicrophonePermission,
  RecordingRef,
} from '../../shared/application/ports';

export class RecordingUseCase {
  private activeRecording: RecordingRef | null = null;
  private startOperation: Promise<RecordingRef> | null = null;
  private stopOperation: Promise<RecordingRef> | null = null;

  constructor(
    private readonly permission: MicrophonePermission,
    private readonly recorder: AudioRecorder,
  ) {}

  start(): Promise<RecordingRef> {
    if (this.activeRecording) {
      return Promise.reject(new Error('Recording is already in progress'));
    }
    if (this.startOperation) {
      return this.startOperation;
    }

    const operation = this.startInternal();
    this.startOperation = operation;
    return operation.finally(() => {
      if (this.startOperation === operation) {
        this.startOperation = null;
      }
    });
  }

  stop(): Promise<RecordingRef> {
    if (this.stopOperation) {
      return this.stopOperation;
    }
    if (!this.activeRecording) {
      return Promise.reject(new Error('No recording is in progress'));
    }

    const operation = this.stopInternal();
    this.stopOperation = operation;
    return operation.finally(() => {
      if (this.stopOperation === operation) {
        this.stopOperation = null;
      }
    });
  }

  cleanup(recording: RecordingRef): Promise<void> {
    return this.recorder.cleanup(recording);
  }

  private async startInternal(): Promise<RecordingRef> {
    if (!(await this.permission.ensure())) {
      throw new Error('Microphone Permission Required');
    }
    const recording = await this.recorder.start();
    this.activeRecording = recording;
    return recording;
  }

  private async stopInternal(): Promise<RecordingRef> {
    try {
      return await this.recorder.stop();
    } finally {
      // Native recorders finalize and release their session even when stop()
      // rejects. Clearing the application state here lets the user retry
      // instead of getting stuck behind a stale "already recording" guard.
      this.activeRecording = null;
    }
  }
}
