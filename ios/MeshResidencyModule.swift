import Foundation
import React
import UIKit

/// iOS half of the mesh residency contract (see src/services/sync/nativeMeshResidency.ts).
///
/// iOS grants no indefinite background execution to an app like this. `beginBackgroundTask` buys a
/// short finite window to finish work in flight; after that the process is suspended and the mesh
/// goes unreachable until the user foregrounds Off Grid again.
///
/// So this module deliberately reports `survivesBackground: false`. Claiming otherwise would put a
/// "Connected" row on the peer's screen for a device that cannot answer. The capability is data the
/// UI renders, not a difference callers branch on.
@objc(MeshResidencyModule)
class MeshResidencyModule: NSObject {
  /// iOS hands out roughly 30s. Reported as a floor for copy, never used as a promise.
  private static let backgroundGraceSeconds: Double = 30

  private var taskId: UIBackgroundTaskIdentifier = .invalid
  private let queue = DispatchQueue(label: "ai.offgridmobile.mesh-residency")

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any]! {
    return [
      "survivesBackground": false,
      "backgroundGraceSeconds": MeshResidencyModule.backgroundGraceSeconds,
      "showsOngoingIndicator": false,
    ]
  }

  @objc(begin:withRejecter:)
  func begin(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.sync {
      guard taskId == .invalid else { return }
      taskId = UIApplication.shared.beginBackgroundTask(withName: "PersonalMesh") { [weak self] in
        // The OS is reclaiming the window. Release the assertion ourselves, or iOS kills the app.
        self?.endTask()
      }
    }
    resolve(nil)
  }

  @objc(end:withRejecter:)
  func end(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    endTask()
    resolve(nil)
  }

  private func endTask() {
    queue.sync {
      guard taskId != .invalid else { return }
      UIApplication.shared.endBackgroundTask(taskId)
      taskId = .invalid
    }
  }
}
