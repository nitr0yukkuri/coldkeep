import Foundation
import React
import UserNotifications

@objc(ColdKeepNotifications)
final class ColdKeepNotificationScheduler: NSObject {
  private let knownIdentifiers = [
    "coldkeep-daily-brief",
    "coldkeep-hydration-reminder",
  ]

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(requestPermission:rejecter:)
  func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert]) { granted, error in
      DispatchQueue.main.async {
        if let error {
          reject("NOTIFICATION_PERMISSION_FAILED", error.localizedDescription, error)
        } else {
          resolve(granted)
        }
      }
    }
  }

  @objc(sync:resolver:rejecter:)
  func sync(
    _ requests: NSArray,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: knownIdentifiers)
    let notifications = requests.compactMap { item -> UNNotificationRequest? in
      guard let request = item as? NSDictionary,
            let identifier = request["id"] as? String,
            let title = request["title"] as? String,
            let body = request["body"] as? String,
            let schedule = request["schedule"] as? NSDictionary else {
        return nil
      }
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = nil
      guard let trigger = trigger(from: schedule) else {
        return nil
      }
      return UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
    }

    let group = DispatchGroup()
    let lock = NSLock()
    var firstError: Error?
    notifications.forEach { request in
      group.enter()
      center.add(request) { error in
        if let error {
          lock.lock()
          if firstError == nil {
            firstError = error
          }
          lock.unlock()
        }
        group.leave()
      }
    }
    group.notify(queue: .main) {
      lock.lock()
      let error = firstError
      lock.unlock()
      if let error {
        reject("NOTIFICATION_SYNC_FAILED", error.localizedDescription, error)
      } else {
        resolve(nil)
      }
    }
  }

  private func trigger(from schedule: NSDictionary) -> UNNotificationTrigger? {
    guard let type = schedule["type"] as? String else {
      return nil
    }
    if type == "daily",
       let hour = schedule["hour"] as? NSNumber,
       let minute = schedule["minute"] as? NSNumber {
      var components = DateComponents()
      components.hour = min(max(hour.intValue, 0), 23)
      components.minute = min(max(minute.intValue, 0), 59)
      return UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
    }
    if type == "once", let epochMs = schedule["atEpochMs"] as? NSNumber {
      let delay = epochMs.doubleValue / 1000 - Date().timeIntervalSince1970
      guard delay > 0 else {
        return nil
      }
      return UNTimeIntervalNotificationTrigger(timeInterval: max(delay, 1), repeats: false)
    }
    return nil
  }
}
