import AVFoundation
import Foundation
import React

@objc(ColdKeepAudioRecorder)
final class ColdKeepAudioRecorder: NSObject {
  private var recorder: AVAudioRecorder?
  private var currentURL: URL?
  private var starting = false
  private let lock = NSLock()

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(requestPermission:rejecter:)
  func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      DispatchQueue.main.async {
        resolve(granted)
      }
    }
  }

  @objc(start:rejecter:)
  func start(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    lock.lock()
    let alreadyRecording = recorder != nil || starting
    if !alreadyRecording {
      starting = true
    }
    lock.unlock()
    if alreadyRecording {
      reject("ALREADY_RECORDING", "A recording is already in progress", nil)
      return
    }

    defer {
      lock.lock()
      starting = false
      lock.unlock()
    }

    do {
      let session = AVAudioSession.sharedInstance()
      guard session.recordPermission == .granted else {
        reject("PERMISSION_DENIED", "Microphone permission is required", nil)
        return
      }

      try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
      try session.setActive(true, options: .notifyOthersOnDeactivation)

      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("coldkeep-\(UUID().uuidString).wav")
      let settings: [String: Any] = [
        AVFormatIDKey: NSNumber(value: kAudioFormatLinearPCM),
        AVSampleRateKey: 16_000,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
      ]
      let nextRecorder = try AVAudioRecorder(url: url, settings: settings)
      guard nextRecorder.prepareToRecord(), nextRecorder.record() else {
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        reject("RECORDER_UNAVAILABLE", "Unable to start the microphone", nil)
        return
      }

      lock.lock()
      recorder = nextRecorder
      currentURL = url
      lock.unlock()
      resolve(url.absoluteString)
    } catch {
      lock.lock()
      recorder = nil
      currentURL = nil
      lock.unlock()
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      reject("RECORDING_START_FAILED", error.localizedDescription, error)
    }
  }

  @objc(stop:rejecter:)
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    lock.lock()
    // iOS may stop the recorder during a phone call or another audio
    // interruption. Keep the URL so stop() can finalize that partial file
    // and let the JavaScript state machine recover on the next recording.
    guard let activeRecorder = recorder,
          let url = currentURL else {
      lock.unlock()
      reject("NOT_RECORDING", "No recording is in progress", nil)
      return
    }
    recorder = nil
    currentURL = nil
    lock.unlock()

    activeRecorder.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    resolve(url.absoluteString)
  }

  deinit {
    recorder?.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
