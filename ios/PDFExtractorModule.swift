import Foundation
import PDFKit

@objc(PDFExtractorModule)
class PDFExtractorModule: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func extractText(_ filePath: String, maxChars: Double, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      print("[PDFExtractor] Received filePath: \(filePath)")

      // Parse the file path as a URL
      var url: URL?
      if filePath.hasPrefix("file://") {
        url = URL(string: filePath)
      } else {
        url = URL(fileURLWithPath: filePath)
      }

      guard let url = url else {
        reject("PDF_ERROR", "Invalid file path: \(filePath)", nil as NSError?)
        return
      }

      print("[PDFExtractor] Parsed URL: \(url.path)")
      print("[PDFExtractor] URL scheme: \(url.scheme ?? "none")")

      // For security-scoped resources (files from document picker), we need to request access
      let didStartAccessing = url.startAccessingSecurityScopedResource()
      print("[PDFExtractor] Security-scoped access: \(didStartAccessing)")

      // Check if file exists
      let fileManager = FileManager.default
      var isDirectory: ObjCBool = false
      let exists = fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory)
      print("[PDFExtractor] File exists: \(exists), isDirectory: \(isDirectory.boolValue)")

      if !exists {
        // Try alternate path without file:// prefix components
        let alternatePath = url.path
        let alternateExists = fileManager.fileExists(atPath: alternatePath, isDirectory: &isDirectory)
        print("[PDFExtractor] Alternate path exists: \(alternateExists)")
      }

      defer {
        if didStartAccessing {
          url.stopAccessingSecurityScopedResource()
        }
      }

      // Check if file is readable
      let isReadable = fileManager.isReadableFile(atPath: url.path)
      print("[PDFExtractor] File is readable: \(isReadable)")

      // Attempt to open the PDF document
      guard let document = PDFDocument(url: url) else {
        // Try to get more specific error info
        let pathExtension = url.pathExtension.lowercased()
        var errorMessage = "Could not open PDF file"

        if !exists {
          errorMessage = "File does not exist at path: \(url.path)"
        } else if !isReadable {
          errorMessage = "File is not readable (permission denied): \(url.path)"
        } else if pathExtension != "pdf" {
          errorMessage = "File extension '\(pathExtension)' is not PDF"
        } else {
          // File exists and is readable but PDFKit couldn't open it
          // Try to read first few bytes to verify it's a PDF
          do {
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            let firstBytes = data.prefix(8)
            let header = firstBytes.map { String(format: "%02X", $0) }.joined(separator: " ")
            print("[PDFExtractor] File header (hex): \(header)")

            if data.count < 5 {
              errorMessage = "File is too small to be a valid PDF: \(data.count) bytes"
            } else if !data.prefix(5).elementsEqual("%PDF-".data(using: .ascii)!) {
              errorMessage = "File does not have valid PDF header. Got: \(header)"
            } else {
              errorMessage = "PDFKit could not parse the PDF file. File size: \(data.count) bytes"
            }
          } catch {
            errorMessage = "Could not read file data: \(error.localizedDescription)"
          }
        }

        print("[PDFExtractor] Error: \(errorMessage)")
        reject("PDF_ERROR", errorMessage, nil as NSError?)
        return
      }

      print("[PDFExtractor] Successfully opened PDF with \(document.pageCount) pages")

      let limit = Int(maxChars)
      var fullText = ""
      for pageIndex in 0..<document.pageCount {
        if let page = document.page(at: pageIndex), let pageText = page.string {
          fullText += pageText
          if pageIndex < document.pageCount - 1 {
            fullText += "\n\n"
          }
        }

        if fullText.count >= limit {
          fullText = String(fullText.prefix(limit))
          fullText += "\n\n... [Extracted \(pageIndex + 1) of \(document.pageCount) pages]"
          break
        }
      }

      print("[PDFExtractor] Extracted \(fullText.count) characters")
      resolve(fullText)
    }
  }
}
