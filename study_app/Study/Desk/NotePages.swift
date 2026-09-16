// 노트 손글씨 페이지 관리 — 새 페이지(종이·크기·색), 순서 바꾸기·복제·회전·삭제, 사진·PDF 가져오기
import SwiftUI
import PencilKit
import PDFKit
import PhotosUI

struct NewPageSheet: View {
    var onCreate: (Paper, CGSize, Tint) -> Void
    @Environment(\.dismiss) private var dismiss
    @AppStorage("ink.paper") private var paper = Paper.blank.rawValue
    @AppStorage("ink.size") private var sizeKey = "portrait"
    @AppStorage("ink.tint") private var tint = Tint.white.rawValue
    static let sizes: [(key: String, label: String, size: CGSize)] = [("portrait", "세로", InkCodec.pageSize), ("landscape", "가로", CGSize(width: 1024, height: 768)), ("a4", "A4", CGSize(width: 595, height: 842)), ("wide", "16:9", CGSize(width: 1280, height: 720))]
    var body: some View {
        NavigationStack {
            Form {
                Section("종이") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 5), spacing: 10) {
                        ForEach(Paper.allCases, id: \.self) { p in
                            VStack(spacing: 6) {
                                Image(uiImage: PaperRenderer.image(p, size: CGSize(width: 180, height: 240), tint: Tint(rawValue: tint) ?? .white)).resizable().aspectRatio(0.75, contentMode: .fit)
                                    .clipShape(RoundedRectangle(cornerRadius: 6)).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(paper == p.rawValue ? DeskTheme.accent : Color.primary.opacity(0.12), lineWidth: paper == p.rawValue ? 2.5 : 1))
                                Text(p.label).font(.caption).foregroundStyle(paper == p.rawValue ? DeskTheme.accent : .secondary)
                            }.onTapGesture { paper = p.rawValue }
                        }
                    }.padding(.vertical, 4)
                }
                Section("크기") { Picker("크기", selection: $sizeKey) { ForEach(Self.sizes, id: \.key) { Text($0.label).tag($0.key) } }.pickerStyle(.segmented) }
                Section("바탕") { Picker("바탕", selection: $tint) { ForEach(Tint.allCases, id: \.self) { Text($0.label).tag($0.rawValue) } }.pickerStyle(.segmented) }
            }
            .navigationTitle("새 페이지").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("추가") { onCreate(Paper(rawValue: paper) ?? .blank, Self.sizes.first { $0.key == sizeKey }?.size ?? InkCodec.pageSize, Tint(rawValue: tint) ?? .white); dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// 순서 바꾸기(드래그)·복제·회전·삭제 — 완료하면 전체 다시 저장
struct PageManageSheet: View {
    @State var pages: [InkPage]
    @ObservedObject var cache: ThumbCache
    var onDone: ([InkPage]) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(pages.enumerated()), id: \.element.key) { i, p in
                    HStack(spacing: 14) {
                        Group { if let img = cache.image(i, p.drawing) { Image(uiImage: img).resizable() } else { Color.white.onAppear { cache.ensure(i, size: p.size, drawing: p.drawing, background: { _ in PaperRenderer.background(for: p) }) } } }
                            .aspectRatio(p.size.width / p.size.height, contentMode: .fit).frame(height: 64).clipShape(RoundedRectangle(cornerRadius: 4)).overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(.quaternary))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(i + 1)쪽").desk(.bodyStrong)
                            Text("\(p.paper.label) · \(Int(p.size.width))×\(Int(p.size.height)) · 획 \(p.drawing.strokes.count)" + (p.bookmark ? " · 북마크" : "")).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Menu {
                            Button("복제", systemImage: "plus.square.on.square") { var d = p; d.key = "dup-\(UUID().uuidString.prefix(6))"; pages.insert(d, at: i + 1) }
                            Button("회전", systemImage: "rotate.right") { pages[i] = p.rotated() }
                            Button("삭제", systemImage: "trash", role: .destructive) { pages.remove(at: i) }
                        } label: { Image(systemName: "ellipsis.circle") }
                    }
                }
                .onMove { from, to in pages.move(fromOffsets: from, toOffset: to) }
                .onDelete { pages.remove(atOffsets: $0) }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("페이지 관리").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("완료") { onDone(pages); dismiss() } }
            }
        }
    }
}

/// 사진·PDF → 페이지(JPEG 배경, 폭 1280 이하)
enum PageImport {
    static func page(from image: UIImage, key: String) -> InkPage {
        let maxW: CGFloat = 1280, k = min(1, maxW / image.size.width)
        let size = CGSize(width: (image.size.width * k).rounded(), height: (image.size.height * k).rounded())
        let img = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return InkPage(key: key, drawing: PKDrawing(), size: size, bg: img.jpegData(compressionQuality: 0.75))
    }
    static func pages(fromPDF url: URL, startKey: Int) -> [InkPage] {
        guard let doc = PDFDocument(url: url) else { return [] }
        return (0..<min(doc.pageCount, 120)).compactMap { i in
            guard let img = DocInk.render(doc, i) else { return nil }
            return page(from: img, key: InkCodec.key(startKey + i))
        }
    }
}
