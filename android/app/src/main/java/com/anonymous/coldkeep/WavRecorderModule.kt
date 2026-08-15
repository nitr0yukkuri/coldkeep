package com.anonymous.coldkeep

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean

class WavRecorderModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val SAMPLE_RATE = 16_000
    private const val CHANNELS = 1
    private const val BITS_PER_SAMPLE = 16
    private const val WAV_HEADER_SIZE = 44
  }

  private val recording = AtomicBoolean(false)
  private var audioRecord: AudioRecord? = null
  private var outputFile: File? = null
  private var recordingThread: Thread? = null

  override fun getName() = "WavRecorder"

  @ReactMethod
  fun start(promise: Promise) {
    if (recording.get()) {
      promise.reject("ALREADY_RECORDING", "A recording is already in progress")
      return
    }
    if (
      reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("PERMISSION_DENIED", "Microphone permission is required")
      return
    }

    val minimumBufferSize = AudioRecord.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    )
    if (minimumBufferSize <= 0) {
      promise.reject("RECORDER_UNAVAILABLE", "Unable to determine an audio buffer size")
      return
    }

    try {
      val recorder = AudioRecord(
        MediaRecorder.AudioSource.MIC,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        minimumBufferSize * 2,
      )
      if (recorder.state != AudioRecord.STATE_INITIALIZED) {
        recorder.release()
        promise.reject("RECORDER_UNAVAILABLE", "Unable to initialize the microphone")
        return
      }

      val file = File.createTempFile("coldkeep-", ".wav", reactContext.cacheDir)
      RandomAccessFile(file, "rw").use { wav ->
        wav.setLength(0)
        wav.write(ByteArray(WAV_HEADER_SIZE))
      }

      audioRecord = recorder
      outputFile = file
      recording.set(true)
      recorder.startRecording()
      recordingThread = Thread({ writeAudio(recorder, file, minimumBufferSize * 2) }, "ColdKeepRecorder")
        .also { it.start() }
      promise.resolve(Uri.fromFile(file).toString())
    } catch (error: Exception) {
      outputFile?.delete()
      releaseRecorder()
      promise.reject("RECORDING_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    val file = outputFile
    if (!recording.compareAndSet(true, false) || file == null) {
      promise.reject("NOT_RECORDING", "No recording is in progress")
      return
    }

    try {
      audioRecord?.stop()
      recordingThread?.join(2_000)
      releaseRecorder()
      writeWavHeader(file)
      promise.resolve(Uri.fromFile(file).toString())
    } catch (error: Exception) {
      file.delete()
      releaseRecorder()
      promise.reject("RECORDING_STOP_FAILED", error.message, error)
    }
  }

  private fun writeAudio(recorder: AudioRecord, file: File, bufferSize: Int) {
    val buffer = ByteArray(bufferSize)
    RandomAccessFile(file, "rw").use { wav ->
      wav.seek(WAV_HEADER_SIZE.toLong())
      while (recording.get()) {
        val read = recorder.read(buffer, 0, buffer.size)
        if (read > 0) {
          wav.write(buffer, 0, read)
        }
      }
    }
  }

  private fun writeWavHeader(file: File) {
    RandomAccessFile(file, "rw").use { wav ->
      val dataLength = wav.length() - WAV_HEADER_SIZE
      val byteRate = SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8
      val header = ByteBuffer.allocate(WAV_HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN)
      header.put("RIFF".toByteArray(Charsets.US_ASCII))
      header.putInt((dataLength + 36).toInt())
      header.put("WAVE".toByteArray(Charsets.US_ASCII))
      header.put("fmt ".toByteArray(Charsets.US_ASCII))
      header.putInt(16)
      header.putShort(1.toShort())
      header.putShort(CHANNELS.toShort())
      header.putInt(SAMPLE_RATE)
      header.putInt(byteRate)
      header.putShort((CHANNELS * BITS_PER_SAMPLE / 8).toShort())
      header.putShort(BITS_PER_SAMPLE.toShort())
      header.put("data".toByteArray(Charsets.US_ASCII))
      header.putInt(dataLength.toInt())
      wav.seek(0)
      wav.write(header.array())
    }
  }

  private fun releaseRecorder() {
    recording.set(false)
    audioRecord?.release()
    audioRecord = null
    recordingThread = null
    outputFile = null
  }

  override fun invalidate() {
    if (recording.getAndSet(false)) {
      runCatching { audioRecord?.stop() }
      recordingThread?.join(500)
    }
    releaseRecorder()
    super.invalidate()
  }
}
