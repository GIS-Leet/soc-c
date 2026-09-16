// 공유받은 항목 읽기 — URL·텍스트·이미지·파일을 NSItemProvider 에서 꺼내 한 구조체로
import Foundation
import UniformTypeIdentifiers
import UIKit

struct ShareItems {
    struct File: Identifiable, Equatable { var name: String; let data: Data; var id: String { name } }
    var url: URL? = nil
    var text: String? = nil
    var title: String? = nil
    var files: [File] = []
    var hasFiles: Bool { !files.isEmpty }

    /// 노트 본문 기본값: 텍스트 줄 + URL 줄
    var noteBody: String { [text, url?.absoluteString].compactMap { $0 }.joined(separator: "\n\n") }
    /// 노트 제목 기본값: 페이지 제목 → 텍스트 첫 줄 → 호스트
    var noteTitle: String {
        if let t = title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { return String(t.prefix(80)) }
        if let l = text?.split(separator: "\n").first, !l.isEmpty { return String(l.prefix(80)) }
        return url?.host ?? ""
    }

    static func load(_ items: [NSExtensionItem]) async -> ShareItems {
        var out = ShareItems()
        var n = 0
        let stamp: String = { let f = DateFormatter(); f.dateFormat = "yyyyMMdd_HHmmss"; return f.string(from: Date()) }()
        for item in items {
            if out.title == nil, let t = item.attributedTitle?.string ?? item.attributedContentText?.string, !t.isEmpty, item.attributedContentText?.string.count ?? 0 < 120 { out.title = t }
            for p in item.attachments ?? [] {
                if p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    if let (name, data) = await file(p, type: UTType.image) {
                        n += 1
                        let ext = (name as NSString).pathExtension.lowercased()
                        if ["png", "gif"].contains(ext) { out.files.append(File(name: name, data: data)) }
                        else if let img = UIImage(data: data), let j = img.jpegData(compressionQuality: 0.85) { out.files.append(File(name: "IMG_\(stamp)_\(n).jpg", data: j)) }
                    }
                } else if p.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) || (p.hasItemConformingToTypeIdentifier(UTType.data.identifier) && !p.hasItemConformingToTypeIdentifier(UTType.url.identifier) && !p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)) {
                    if let (name, data) = await file(p, type: UTType.data) { out.files.append(File(name: name, data: data)) }
                } else if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let u = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL { if u.isFileURL, let d = try? Data(contentsOf: u) { out.files.append(File(name: u.lastPathComponent, data: d)) } else { out.url = u } }
                } else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let s = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String { out.text = (out.text.map { $0 + "\n" } ?? "") + s }
                }
            }
        }
        return out
    }
    /// 파일 표현으로 받아 즉시 복사(핸들러가 끝나면 임시 파일이 지워지므로)
    private static func file(_ p: NSItemProvider, type: UTType) async -> (String, Data)? {
        let id = p.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: type) == true } ?? type.identifier
        return await withCheckedContinuation { cont in
            _ = p.loadFileRepresentation(forTypeIdentifier: id) { url, _ in
                guard let url, let d = try? Data(contentsOf: url) else { cont.resume(returning: nil); return }
                // 파일 앱·사진은 suggestedName 에 원래 이름을 줌(확장자 없을 수 있음). 없으면 임시 파일 이름
                let name = p.suggestedName.map { $0.contains(".") ? $0 : $0 + "." + url.pathExtension } ?? url.lastPathComponent
                cont.resume(returning: (name, d))
            }
        }
    }
}
