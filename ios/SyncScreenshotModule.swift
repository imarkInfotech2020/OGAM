import Foundation
import Photos
import UIKit
import UniformTypeIdentifiers

@objc(SyncScreenshotModule)
final class SyncScreenshotModule: RCTEventEmitter {
  private var enabled = false
  private var hasListeners = false
  private var lastAssetIdentifier: String?

  @objc
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String] {
    ["SyncScreenshotCaptured"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc
  func setEnabled(_ next: Bool) {
    DispatchQueue.main.async { [weak self] in
      guard let self, enabled != next else { return }
      enabled = next
      NotificationCenter.default.removeObserver(
        self,
        name: UIApplication.userDidTakeScreenshotNotification,
        object: nil
      )
      guard next else { return }
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] status in
        guard status == .authorized || status == .limited else { return }
        DispatchQueue.main.async {
          guard let self, self.enabled else { return }
          NotificationCenter.default.addObserver(
            self,
            selector: #selector(self.screenshotTaken),
            name: UIApplication.userDidTakeScreenshotNotification,
            object: nil
          )
        }
      }
    }
  }

  @objc private func screenshotTaken() {
    guard enabled else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { [weak self] in
      self?.captureLatestScreenshot()
    }
  }

  private func captureLatestScreenshot() {
    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.fetchLimit = 1
    options.predicate = NSPredicate(
      format: "(mediaSubtype & %d) != 0",
      PHAssetMediaSubtype.photoScreenshot.rawValue
    )
    let assets = PHAsset.fetchAssets(with: .image, options: options)
    guard
      let asset = assets.firstObject,
      asset.localIdentifier != lastAssetIdentifier
    else { return }
    lastAssetIdentifier = asset.localIdentifier

    let requestOptions = PHImageRequestOptions()
    requestOptions.isNetworkAccessAllowed = false
    requestOptions.deliveryMode = .highQualityFormat
    requestOptions.version = .current
    PHImageManager.default().requestImageDataAndOrientation(
      for: asset,
      options: requestOptions
    ) { [weak self] data, typeIdentifier, _, _ in
      guard let self, let data else { return }
      self.persist(
        data: data,
        typeIdentifier: typeIdentifier,
        asset: asset
      )
    }
  }

  private func persist(
    data: Data,
    typeIdentifier: String?,
    asset: PHAsset
  ) {
    do {
      let documents = try FileManager.default.url(
        for: .documentDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      )
      let capture = try SyncScreenshotFileWriter.persist(
        data: data,
        typeIdentifier: typeIdentifier,
        createdAt: asset.creationDate ?? Date(),
        width: asset.pixelWidth,
        height: asset.pixelHeight,
        documentsURL: documents
      )
      guard hasListeners else { return }
      sendEvent(
        withName: "SyncScreenshotCaptured",
        body: capture
      )
    } catch {
      // The TypeScript owner retains queue/error state after a descriptor exists.
      // A local copy failure has no transferable file and is intentionally ignored.
    }
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }
}

enum SyncScreenshotFileWriter {
  static func persist(
    data: Data,
    typeIdentifier: String?,
    createdAt: Date,
    width: Int,
    height: Int,
    documentsURL: URL,
    syncId: UUID = UUID()
  ) throws -> [String: Any] {
    let stableId = syncId.uuidString.lowercased()
    let fileType = typeIdentifier.flatMap(UTType.init)
    let fileExtension = fileType?.preferredFilenameExtension ?? "png"
    let mimeType = fileType?.preferredMIMEType ?? "image/png"
    let name = "Screenshot-\(stableId).\(fileExtension)"
    let directory = documentsURL.appendingPathComponent(
      "sync_screenshots",
      isDirectory: true
    )
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
    let destination = directory.appendingPathComponent(name)
    try data.write(to: destination, options: .atomic)
    return [
      "syncId": stableId,
      "name": name,
      "mimeType": mimeType,
      "filePath": destination.path,
      "fileSize": data.count,
      "createdAt": createdAt.iso8601String,
      "width": width,
      "height": height,
    ]
  }
}

private extension Date {
  var iso8601String: String {
    ISO8601DateFormatter().string(from: self)
  }
}
