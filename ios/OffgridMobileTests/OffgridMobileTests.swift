import XCTest
import PDFKit

@testable import OffgridMobile

// MARK: - PDFExtractorModule Tests

final class PDFExtractorModuleTests: XCTestCase {

  private var module: PDFExtractorModule!

  override func setUp() {
    super.setUp()
    module = PDFExtractorModule()
  }

  /// Creates an n-page PDF and returns its file URL in the temp directory.
  private func makeTempPDF(pages: [(text: String, rect: CGRect)] = []) -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString + ".pdf")
    let pageSize = CGRect(x: 0, y: 0, width: 612, height: 792)
    let renderer = UIGraphicsPDFRenderer(bounds: pageSize)
    let data = renderer.pdfData { ctx in
      let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 12)]
      for page in pages {
        ctx.beginPage()
        page.text.draw(in: page.rect, withAttributes: attrs)
      }
    }
    try! data.write(to: url)
    return url
  }

  private func singlePage(text: String) -> URL {
    makeTempPDF(pages: [(text, CGRect(x: 72, y: 72, width: 468, height: 648))])
  }

  // MARK: requiresMainQueueSetup

  func testRequiresMainQueueSetupReturnsFalse() {
    XCTAssertFalse(PDFExtractorModule.requiresMainQueueSetup())
  }

  // MARK: extractText — happy path

  func testExtractTextResolvesWithContent() {
    let url = singlePage(text: "Hello, PDF World!")
    let exp = expectation(description: "resolve")

    module.extractText(
      url.absoluteString,
      maxChars: 10_000,
      resolver: { result in
        XCTAssertNotNil(result)
        exp.fulfill()
      },
      rejecter: { _, _, _ in
        XCTFail("extractText should not reject a valid PDF")
        exp.fulfill()
      }
    )

    waitForExpectations(timeout: 5)
    try? FileManager.default.removeItem(at: url)
  }

  func testExtractTextFromMultiPagePDF() {
    let url = makeTempPDF(pages: [
      ("Page one content", CGRect(x: 72, y: 72, width: 468, height: 648)),
      ("Page two content", CGRect(x: 72, y: 72, width: 468, height: 648)),
    ])
    let exp = expectation(description: "multi-page resolve")

    module.extractText(
      url.absoluteString,
      maxChars: 10_000,
      resolver: { result in
        XCTAssertNotNil(result)
        exp.fulfill()
      },
      rejecter: { _, _, _ in
        XCTFail("multi-page extractText should not reject")
        exp.fulfill()
      }
    )

    waitForExpectations(timeout: 5)
    try? FileManager.default.removeItem(at: url)
  }

  func testExtractTextFromEmptyPDF() {
    // PDF with a page but no text drawn — should resolve with empty string
    let url = makeTempPDF(pages: [("", CGRect(x: 72, y: 72, width: 468, height: 648))])
    let exp = expectation(description: "empty pdf resolve")

    module.extractText(
      url.absoluteString,
      maxChars: 10_000,
      resolver: { result in
        XCTAssertNotNil(result)
        exp.fulfill()
      },
      rejecter: { _, _, _ in
        XCTFail("empty-page PDF should not reject")
        exp.fulfill()
      }
    )

    waitForExpectations(timeout: 5)
    try? FileManager.default.removeItem(at: url)
  }

  // MARK: extractText — truncation

  func testExtractTextTruncatesAtMaxChars() {
    let longText = String(repeating: "A", count: 300)
    let url = singlePage(text: longText)
    let exp = expectation(description: "truncate")

    module.extractText(
      url.absoluteString,
      maxChars: 50,
      resolver: { result in
        let text = (result as? String) ?? ""
        XCTAssertTrue(
          text.contains("... [Extracted"),
          "Truncated result should contain page marker, got: \(text.prefix(120))"
        )
        exp.fulfill()
      },
      rejecter: { _, _, _ in
        XCTFail("extractText should not reject")
        exp.fulfill()
      }
    )

    waitForExpectations(timeout: 5)
    try? FileManager.default.removeItem(at: url)
  }

  func testExtractTextDoesNotTruncateWhenUnderLimit() {
    let shortText = "Short"
    let url = singlePage(text: shortText)
    let exp = expectation(description: "no truncate")

    module.extractText(
      url.absoluteString,
      maxChars: 10_000,
      resolver: { result in
        let text = (result as? String) ?? ""
        XCTAssertFalse(
          text.contains("... [Extracted"),
          "Short text should not be truncated"
        )
        exp.fulfill()
      },
      rejecter: { _, _, _ in
        XCTFail("should not reject")
        exp.fulfill()
      }
    )

    waitForExpectations(timeout: 5)
    try? FileManager.default.removeItem(at: url)
  }

  // MARK: extractText — error cases

  func testExtractTextRejectsInvalidPath() {
    let exp = expectation(description: "reject invalid path")

    module.extractText(
      "/nonexistent/path/file.pdf",
      maxChars: 10_000,
      resolver: { _ in
        XCTFail("extractText should reject a non-existent file")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "PDF_ERROR")
        exp.fulfill()
      }
    )

    waitForExpectations(timeout: 5)
  }

  func testExtractTextRejectsNonPDFFile() {
    // Write a plain-text file and pass it as a PDF
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString + ".pdf")
    try! "not a pdf".write(to: url, atomically: true, encoding: .utf8)
    let exp = expectation(description: "reject non-pdf")

    module.extractText(
      url.absoluteString,
      maxChars: 10_000,
      resolver: { _ in
        XCTFail("should reject a non-PDF file")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "PDF_ERROR")
        exp.fulfill()
      }
    )

    waitForExpectations(timeout: 5)
    try? FileManager.default.removeItem(at: url)
  }
}

// MARK: - CoreMLDiffusionModule Tests

final class CoreMLDiffusionModuleTests: XCTestCase {

  private var module: CoreMLDiffusionModule!

  override func setUp() {
    super.setUp()
    module = CoreMLDiffusionModule()
  }

  // MARK: requiresMainQueueSetup

  func testRequiresMainQueueSetupReturnsFalse() {
    XCTAssertFalse(CoreMLDiffusionModule.requiresMainQueueSetup())
  }

  // MARK: supportedEvents

  func testSupportedEvents() {
    let events = module.supportedEvents()!
    XCTAssertTrue(events.contains("LocalDreamProgress"))
    XCTAssertTrue(events.contains("LocalDreamError"))
    XCTAssertEqual(events.count, 2)
  }

  // MARK: initial state queries

  func testIsNpuSupportedReturnsTrue() {
    let exp = expectation(description: "isNpuSupported")
    module.isNpuSupported(
      { value in
        XCTAssertEqual(value as? Bool, true)
        exp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail("unexpected reject"); exp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  func testIsGeneratingReturnsFalseInitially() {
    let exp = expectation(description: "isGenerating")
    module.isGenerating(
      { value in
        XCTAssertEqual(value as? Bool, false)
        exp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail("unexpected reject"); exp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  func testIsModelLoadedReturnsFalseInitially() {
    let exp = expectation(description: "isModelLoaded")
    module.isModelLoaded(
      { value in
        XCTAssertEqual(value as? Bool, false)
        exp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail("unexpected reject"); exp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  func testGetLoadedModelPathReturnsNilInitially() {
    let exp = expectation(description: "getLoadedModelPath")
    module.getLoadedModelPath(
      { value in
        // No model loaded — path must be nil or non-String
        XCTAssertNil(value as? String)
        exp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail("unexpected reject"); exp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  // MARK: cancel / unload

  func testCancelGenerationSucceeds() {
    let exp = expectation(description: "cancelGeneration")
    module.cancelGeneration(
      { value in
        XCTAssertEqual(value as? Bool, true)
        exp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail("unexpected reject"); exp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  func testCancelGenerationDoesNotAffectGeneratingState() {
    // cancelGeneration with no active generation must leave isGenerating = false
    let cancelExp = expectation(description: "cancel")
    module.cancelGeneration(
      { _ in cancelExp.fulfill() },
      rejecter: { _, _, _ in cancelExp.fulfill() }
    )
    waitForExpectations(timeout: 2)

    let stateExp = expectation(description: "isGenerating after cancel")
    module.isGenerating(
      { value in
        XCTAssertEqual(value as? Bool, false)
        stateExp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail(); stateExp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  func testUnloadModelSucceeds() {
    // Unloading when no model is loaded should still resolve true
    let exp = expectation(description: "unloadModel")
    module.unloadModel(
      { value in
        XCTAssertEqual(value as? Bool, true)
        exp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail("unexpected reject"); exp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  func testUnloadModelKeepsIsModelLoadedFalse() {
    let unloadExp = expectation(description: "unload")
    module.unloadModel(
      { _ in unloadExp.fulfill() },
      rejecter: { _, _, _ in unloadExp.fulfill() }
    )
    waitForExpectations(timeout: 2)

    let checkExp = expectation(description: "isModelLoaded after unload")
    module.isModelLoaded(
      { value in
        XCTAssertEqual(value as? Bool, false)
        checkExp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail(); checkExp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  // MARK: generateImage guard — no model loaded

  func testGenerateImageWithoutModelRejectsWithNoModel() {
    let exp = expectation(description: "generateImage rejects without model")
    module.generateImage(
      ["prompt": "a cat"],
      resolver: { _ in
        XCTFail("should reject when no model is loaded")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "ERR_NO_MODEL")
        exp.fulfill()
      }
    )
    waitForExpectations(timeout: 2)
  }

  // MARK: getGeneratedImages

  func testGetGeneratedImagesReturnsArray() {
    let exp = expectation(description: "getGeneratedImages")
    module.getGeneratedImages(
      { value in
        XCTAssertNotNil(value as? [[String: Any]], "Expected an array of image dictionaries")
        exp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail("unexpected reject"); exp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }
}

// MARK: - DownloadManagerModule Tests

final class DownloadManagerModuleTests: XCTestCase {

  private var module: DownloadManagerModule!

  override func setUp() {
    super.setUp()
    // Clear any persisted download state so tests start clean
    UserDefaults.standard.removeObject(forKey: "ai.offgridmobile.activeDownloads")
    module = DownloadManagerModule()
  }

  // MARK: requiresMainQueueSetup

  func testRequiresMainQueueSetupReturnsFalse() {
    XCTAssertFalse(DownloadManagerModule.requiresMainQueueSetup())
  }

  // MARK: supportedEvents

  func testSupportedEventsContainsAllExpectedEvents() {
    let events = module.supportedEvents()!
    XCTAssertTrue(events.contains("DownloadProgress"))
    XCTAssertTrue(events.contains("DownloadComplete"))
    XCTAssertTrue(events.contains("DownloadError"))
    XCTAssertEqual(events.count, 3)
  }

  // MARK: getActiveDownloads

  func testGetActiveDownloadsInitiallyEmpty() {
    let exp = expectation(description: "getActiveDownloads empty")
    module.getActiveDownloads(
      { value in
        let downloads = value as? [[String: Any]] ?? []
        XCTAssertEqual(downloads.count, 0, "No active downloads expected after fresh init")
        exp.fulfill()
      },
      rejecter: { _, _, _ in XCTFail("unexpected reject"); exp.fulfill() }
    )
    waitForExpectations(timeout: 2)
  }

  // MARK: getDownloadProgress — unknown id

  func testGetDownloadProgressRejectsUnknownId() {
    let exp = expectation(description: "getDownloadProgress rejects unknown id")
    module.getDownloadProgress(
      99_999,
      resolver: { _ in
        XCTFail("should reject for unknown download id")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "NOT_FOUND")
        exp.fulfill()
      }
    )
    waitForExpectations(timeout: 2)
  }

  // MARK: cancelDownload — unknown id

  func testCancelDownloadRejectsUnknownId() {
    let exp = expectation(description: "cancelDownload rejects unknown id")
    module.cancelDownload(
      99_999,
      resolver: { _ in
        XCTFail("should reject for unknown download id")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "NOT_FOUND")
        exp.fulfill()
      }
    )
    waitForExpectations(timeout: 2)
  }

  // MARK: moveCompletedDownload — unknown id

  func testMoveCompletedDownloadRejectsUnknownId() {
    let exp = expectation(description: "moveCompletedDownload rejects unknown id")
    module.moveCompletedDownload(
      99_999,
      targetPath: "/tmp/model.bin",
      resolver: { _ in
        XCTFail("should reject for unknown download id")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "NOT_FOUND")
        exp.fulfill()
      }
    )
    waitForExpectations(timeout: 2)
  }

  // MARK: startDownload — invalid params

  func testStartDownloadRejectsMissingUrl() {
    let exp = expectation(description: "startDownload rejects missing url")
    module.startDownload(
      ["fileName": "model.bin", "modelId": "m1"],
      resolver: { _ in
        XCTFail("should reject when url is missing")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "INVALID_PARAMS")
        exp.fulfill()
      }
    )
    waitForExpectations(timeout: 2)
  }

  func testStartDownloadRejectsMissingFileName() {
    let exp = expectation(description: "startDownload rejects missing fileName")
    module.startDownload(
      ["url": "https://example.com/model.bin", "modelId": "m1"],
      resolver: { _ in
        XCTFail("should reject when fileName is missing")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "INVALID_PARAMS")
        exp.fulfill()
      }
    )
    waitForExpectations(timeout: 2)
  }

  func testStartDownloadRejectsMissingModelId() {
    let exp = expectation(description: "startDownload rejects missing modelId")
    module.startDownload(
      ["url": "https://example.com/model.bin", "fileName": "model.bin"],
      resolver: { _ in
        XCTFail("should reject when modelId is missing")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "INVALID_PARAMS")
        exp.fulfill()
      }
    )
    waitForExpectations(timeout: 2)
  }

  // MARK: startMultiFileDownload — invalid params

  func testStartMultiFileDownloadRejectsMissingParams() {
    let exp = expectation(description: "startMultiFileDownload rejects missing params")
    module.startMultiFileDownload(
      [:],
      resolver: { _ in
        XCTFail("should reject when params are missing")
        exp.fulfill()
      },
      rejecter: { code, _, _ in
        XCTAssertEqual(code, "INVALID_PARAMS")
        exp.fulfill()
      }
    )
    waitForExpectations(timeout: 2)
  }
}
