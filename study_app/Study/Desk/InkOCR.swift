// 손글씨 인식(Vision) — 페이지 잉크를 그림으로 만들어 한국어·영어 텍스트로. 저장 5초 뒤 뒤에서 돌리고 검색·복사에 쓴다
import Vision
import PencilKit
import UIKit

enum InkOCR {
    /// 잉크만 흰 바탕에 그려 인식(배경 글자와 섞이지 않게)
    static func recognize(_ drawing: PKDrawing, size: CGSize) async -> String {
        guard !drawing.strokes.isEmpty else { return "" }
        let img = drawing.image(from: CGRect(origin: .zero, size: size), scale: 2)
        let flat = UIGraphicsImageRenderer(size: img.size).image { ctx in UIColor.white.setFill(); ctx.fill(CGRect(origin: .zero, size: img.size)); img.draw(at: .zero) }
        guard let cg = flat.cgImage else { return "" }
        return await withCheckedContinuation { cont in
            let req = VNRecognizeTextRequest { r, _ in
                let lines = (r.results as? [VNRecognizedTextObservation] ?? []).sorted { $0.boundingBox.minY > $1.boundingBox.minY }.compactMap { $0.topCandidates(1).first?.string }
                cont.resume(returning: lines.joined(separator: "\n"))
            }
            req.recognitionLevel = .accurate; req.recognitionLanguages = ["ko-KR", "en-US"]; req.usesLanguageCorrection = true
            DispatchQueue.global(qos: .utility).async { try? VNImageRequestHandler(cgImage: cg).perform([req]) }
        }
    }
}
