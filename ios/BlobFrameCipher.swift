import CryptoKit
import Foundation

/// The iPhone's end of the framed payload format.
///
/// The format - a frame size, a nonce per frame, what each frame is authenticated against - is defined
/// once in the shared sync package and mirrored here, because native code cannot import TypeScript. The
/// frame size itself is passed down from JavaScript rather than restated, and the end-to-end test moves
/// real payloads between this device and the other two so a disagreement shows up as a failed transfer
/// in a test rather than a corrupt model on a phone.
///
/// Frames are what make this possible at all on iOS: CryptoKit seals a complete message, so a single
/// stream over a four gigabyte model would mean holding it in memory twice. A frame at a time, memory
/// holds four megabytes.
struct BlobFrameCipher {
  enum Failure: Error {
    case malformed
    case tagMismatch
  }

  static let tagBytes = 16

  private let key: SymmetricKey
  private let nonce: Data
  private let fileSize: Int
  private let frameBytes: Int

  init(key: Data, nonce: Data, fileSize: Int, frameBytes: Int) throws {
    guard key.count == 32, nonce.count == 12, frameBytes > 0, fileSize >= 0 else {
      throw Failure.malformed
    }
    self.key = SymmetricKey(data: key)
    self.nonce = nonce
    self.fileSize = fileSize
    self.frameBytes = frameBytes
  }

  var frameCount: Int { max(1, (fileSize + frameBytes - 1) / frameBytes) }

  /// How many payload bytes are in a given frame. Only the last one is short.
  func frameLength(_ index: Int) -> Int {
    index < frameCount - 1 ? frameBytes : fileSize - frameBytes * (frameCount - 1)
  }

  /// What a frame occupies on the wire: its payload plus its tag.
  func sealedLength(_ index: Int) -> Int { frameLength(index) + Self.tagBytes }

  /// The whole sealed body, which the sender declares before it sends a byte.
  var sealedLength: Int { fileSize + frameCount * Self.tagBytes }

  func seal(_ plain: Data, index: Int) throws -> Data {
    let box = try AES.GCM.seal(
      plain,
      using: key,
      nonce: try AES.GCM.Nonce(data: frameNonce(index)),
      authenticating: aad(index))
    return box.ciphertext + box.tag
  }

  func open(_ sealed: Data, index: Int) throws -> Data {
    guard sealed.count > Self.tagBytes else { throw Failure.malformed }
    let split = sealed.count - Self.tagBytes
    let box = try AES.GCM.SealedBox(
      nonce: try AES.GCM.Nonce(data: frameNonce(index)),
      ciphertext: sealed.prefix(split),
      tag: sealed.suffix(Self.tagBytes))
    do {
      return try AES.GCM.open(box, using: key, authenticating: aad(index))
    } catch {
      throw Failure.tagMismatch
    }
  }

  /// The transfer's nonce with the frame's number in its last four bytes, big-endian.
  private func frameNonce(_ index: Int) -> Data {
    var framed = nonce
    framed[framed.startIndex + 8] = UInt8((index >> 24) & 0xff)
    framed[framed.startIndex + 9] = UInt8((index >> 16) & 0xff)
    framed[framed.startIndex + 10] = UInt8((index >> 8) & 0xff)
    framed[framed.startIndex + 11] = UInt8(index & 0xff)
    return framed
  }

  /// A frame is bound to its position and to whether the payload ends there, so neither the ORDER nor
  /// the LENGTH of the payload can be changed without the tag failing.
  private func aad(_ index: Int) -> Data {
    Data([
      UInt8((index >> 24) & 0xff),
      UInt8((index >> 16) & 0xff),
      UInt8((index >> 8) & 0xff),
      UInt8(index & 0xff),
      index == frameCount - 1 ? 1 : 0,
    ])
  }
}
