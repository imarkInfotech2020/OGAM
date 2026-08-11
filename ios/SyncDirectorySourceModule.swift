import Foundation
import UniformTypeIdentifiers

@objc(SyncDirectorySourceModule)
final class SyncDirectorySourceModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func enumerate(
    _ grant: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      resolve(try withFolder(grant) { root in
        let keys: Set<URLResourceKey> = [
          .isRegularFileKey,
          .isHiddenKey,
          .nameKey,
          .fileSizeKey,
          .creationDateKey,
          .contentModificationDateKey,
          .contentTypeKey,
        ]
        guard let enumerator = FileManager.default.enumerator(
          at: root,
          includingPropertiesForKeys: Array(keys),
          options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
          return []
        }
        return enumerator.compactMap { item -> [String: Any]? in
          guard let url = item as? URL else { return nil }
          let values = try? url.resourceValues(forKeys: keys)
          guard
            values?.isRegularFile == true,
            values?.isHidden != true,
            let name = values?.name,
            let fileSize = values?.fileSize,
            let modifiedAt = values?.contentModificationDate
          else { return nil }
          let relative = url.path.replacingOccurrences(
            of: root.path + "/",
            with: "",
            options: [.anchored]
          )
          let type = values?.contentType ?? UTType(filenameExtension: url.pathExtension)
          let createdAt = values?.creationDate ?? modifiedAt
          return [
            "sourceId": relative,
            "name": name,
            "mimeType": type?.preferredMIMEType ?? "application/octet-stream",
            "fileSize": fileSize,
            "createdAt": ISO8601DateFormatter().string(from: createdAt),
            "modifiedAt": modifiedAt.timeIntervalSince1970 * 1_000,
          ]
        }
      })
    } catch {
      reject("directory_enumeration_failed", error.localizedDescription, error)
    }
  }

  @objc
  func stage(
    _ grant: String,
    sourceId: String,
    destinationName: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      resolve(try withFolder(grant) { root in
        let source = root.appendingPathComponent(sourceId).standardizedFileURL
        guard
          source.path.hasPrefix(root.standardizedFileURL.path + "/"),
          FileManager.default.fileExists(atPath: source.path)
        else {
          throw DirectorySourceError.invalidSource
        }
        let documents = try FileManager.default.url(
          for: .documentDirectory,
          in: .userDomainMask,
          appropriateFor: nil,
          create: true
        )
        let directory = documents
          .appendingPathComponent("shared_files", isDirectory: true)
          .appendingPathComponent("download", isDirectory: true)
        try FileManager.default.createDirectory(
          at: directory,
          withIntermediateDirectories: true
        )
        let destination = try availableDestination(
          directory: directory,
          requestedName: destinationName
        )
        try FileManager.default.copyItem(at: source, to: destination)
        return [
          "filePath": destination.path,
          "name": destination.lastPathComponent,
        ]
      })
    } catch {
      reject("directory_stage_failed", error.localizedDescription, error)
    }
  }

  private func withFolder<T>(_ grant: String, operation: (URL) throws -> T) throws -> T {
    guard let bookmark = Data(base64Encoded: grant) else {
      throw DirectorySourceError.invalidGrant
    }
    var stale = false
    let root = try URL(
      resolvingBookmarkData: bookmark,
      options: [],
      relativeTo: nil,
      bookmarkDataIsStale: &stale
    )
    guard !stale, root.startAccessingSecurityScopedResource() else {
      throw DirectorySourceError.invalidGrant
    }
    defer { root.stopAccessingSecurityScopedResource() }
    return try operation(root)
  }

  private func availableDestination(directory: URL, requestedName: String) throws -> URL {
    let safeName = URL(fileURLWithPath: requestedName).lastPathComponent
    guard !safeName.isEmpty else { throw DirectorySourceError.invalidSource }
    var destination = directory.appendingPathComponent(safeName)
    let stem = destination.deletingPathExtension().lastPathComponent
    let ext = destination.pathExtension
    var suffix = 2
    while FileManager.default.fileExists(atPath: destination.path) {
      let next = ext.isEmpty ? "\(stem) \(suffix)" : "\(stem) \(suffix).\(ext)"
      destination = directory.appendingPathComponent(next)
      suffix += 1
    }
    return destination
  }
}

private enum DirectorySourceError: LocalizedError {
  case invalidGrant
  case invalidSource

  var errorDescription: String? {
    switch self {
    case .invalidGrant:
      return "The selected folder is no longer available."
    case .invalidSource:
      return "The selected file is no longer available."
    }
  }
}
