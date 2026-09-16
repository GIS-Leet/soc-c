// 위젯 화면을 실제 크기로 그려 PNG로 저장 — 디자인 확인용 (scratchpad에 씀)
import XCTest
import SwiftUI
import WidgetKit
@testable import Desk

final class WidgetSnapshotTests: XCTestCase {
    let outDir = "/private/tmp/claude-501/-Users-leet/c0d63599-7c64-4eb8-9c7e-c0f8c2a01f9f/scratchpad/widget"
    func date(_ s: String) -> Date { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)! }
    @MainActor
    func render<V: View>(_ v: V, size: CGSize, name: String, dark: Bool) {
        let host = v.padding(16).frame(width: size.width, height: size.height)
            .background(dark ? Color(red: 0.11, green: 0.11, blue: 0.12) : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .padding(12).background(dark ? Color.black : Color(red: 0.93, green: 0.93, blue: 0.95))
            .environment(\.colorScheme, dark ? .dark : .light)
            .environment(\.locale, Locale(identifier: "ko_KR"))
        let r = ImageRenderer(content: host); r.scale = 3
        guard let img = r.uiImage, let png = img.pngData() else { return XCTFail("render") }
        try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: "\(outDir)/\(name).png", contents: png)
    }
    @MainActor
    func test_snapshots() {
        let t = Timetable(days: ["wed": [2: "107 통사2C", 4: "102 통사2D", 6: "110 통사2C"]])
        let now = date("2026-09-09 10:40")   // 수: 2교시 끝, 4교시 다음
        for dark in [false, true] {
            render(DeskWidgetView(entry: Entry(date: now, table: t), family: .systemSmall), size: CGSize(width: 170, height: 170), name: "small_next\(dark ? "_dark" : "")", dark: dark)
            render(DeskWidgetView(entry: Entry(date: now, table: t), family: .systemMedium), size: CGSize(width: 364, height: 170), name: "medium\(dark ? "_dark" : "")", dark: dark)
        }
        let inClass = date("2026-09-09 11:30")
        render(DeskWidgetView(entry: Entry(date: inClass, table: t), family: .systemSmall), size: CGSize(width: 170, height: 170), name: "small_now", dark: false)
        render(DeskWidgetView(entry: Entry(date: inClass, table: t), family: .systemMedium), size: CGSize(width: 364, height: 170), name: "medium_now", dark: false)
        let after = date("2026-09-09 16:00"), tomorrow = Timetable(days: ["wed": [2: "107 통사2C"], "thu": [1: "201 통사2A", 3: "204 통사2B", 5: "110 통사2C"]])
        render(DeskWidgetView(entry: Entry(date: after, table: tomorrow), family: .systemSmall), size: CGSize(width: 170, height: 170), name: "small_tomorrow", dark: false)
        render(DeskWidgetView(entry: Entry(date: after, table: tomorrow), family: .systemMedium), size: CGSize(width: 364, height: 170), name: "medium_tomorrow", dark: true)
        XCTAssertTrue(FileManager.default.fileExists(atPath: "\(outDir)/medium.png"))
    }
}
