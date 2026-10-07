// Reads the text in an image (macOS Vision), one line per piece of text: `ocr image.png`.
// Lax uses it to read the name at the top of a WhatsApp chat, so it knows whose chat it opened.
import Foundation
import Vision

guard CommandLine.arguments.count > 1, let url = Optional(URL(fileURLWithPath: CommandLine.arguments[1])),
      let src = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  FileHandle.standardError.write("usage: ocr image.png\n".data(using: .utf8)!); exit(1)
}
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: img).perform([req])
for o in req.results ?? [] { if let t = o.topCandidates(1).first?.string { print(t) } }
