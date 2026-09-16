// 일정 위젯 화면 PNG — 디자인 확인용
import XCTest
import SwiftUI
import WidgetKit
@testable import Desk

final class CalendarWidgetSnapshotTests: XCTestCase {
    let outDir = "/private/tmp/claude-501/-Users-leet/c0d63599-7c64-4eb8-9c7e-c0f8c2a01f9f/scratchpad/widget"
    func date(_ s: String) -> Date { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)! }
    @MainActor
    func render<V: View>(_ v: V, size: CGSize, name: String, dark: Bool) {
        let host = v.padding(16).frame(width: size.width, height: size.height)
            .background(dark ? Color(red: 0.11, green: 0.11, blue: 0.12) : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 22)).padding(12).background(dark ? Color.black : Color(red: 0.93, green: 0.93, blue: 0.95))
            .environment(\.colorScheme, dark ? .dark : .light).environment(\.locale, Locale(identifier: "ko_KR"))
        let r = ImageRenderer(content: host); r.scale = 3
        guard let img = r.uiImage, let png = img.pngData() else { return XCTFail("render") }
        try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: "\(outDir)/\(name).png", contents: png)
    }
    @MainActor
    func test_calendar_snapshots() {
        let now = date("2026-09-11 10:40"); let k = { (i: Int) in WidgetEvent.key(now.addingTimeInterval(Double(i) * 86400)) }
        let ev: [WidgetEvent] = [
            WidgetEvent(id: "1", date: k(0), title: "교과협의회", minutes: 9 * 60, source: "desk"), WidgetEvent(id: "2", date: k(0), title: "2학년 수행평가 채점", minutes: 15 * 60 + 30, source: "desk"),
            WidgetEvent(id: "3", date: k(0), title: "안내문 배부", minutes: nil, source: "desk"), WidgetEvent(id: "4", date: k(0), title: "치과", minutes: 18 * 60, source: "apple", colorHex: "FF6B6B"),
            WidgetEvent(id: "5", date: k(1), title: "동아리 발표회", minutes: 13 * 60, source: "desk"), WidgetEvent(id: "6", date: k(3), title: "학부모 상담 주간", minutes: nil, source: "desk"),
            WidgetEvent(id: "7", date: k(4), title: "대학원 세미나", minutes: 19 * 60, source: "apple", colorHex: "34C759")]
        for dark in [false, true] {
            let sfx = dark ? "_dark" : ""
            render(CalendarWidgetView(entry: CalendarEntry(date: now, events: ev), family: .systemSmall), size: CGSize(width: 170, height: 170), name: "cal_small\(sfx)", dark: dark)
            render(CalendarWidgetView(entry: CalendarEntry(date: now, events: ev), family: .systemMedium), size: CGSize(width: 364, height: 170), name: "cal_medium\(sfx)", dark: dark)
            render(CalendarWidgetView(entry: CalendarEntry(date: now, events: ev), family: .systemLarge), size: CGSize(width: 364, height: 382), name: "cal_large\(sfx)", dark: dark)
        }
        render(CalendarWidgetView(entry: CalendarEntry(date: now, events: []), family: .systemMedium), size: CGSize(width: 364, height: 170), name: "cal_medium_empty", dark: false)
        // 잠금 화면 사각(약 160×72pt) — 글자가 잘리지 않는지. 배경(투명 처리)은 그림으로는 확인 안 되고 실제 잠금 화면에서만 보인다
        render(CalendarWidgetView(entry: CalendarEntry(date: now, events: ev), family: .accessoryRectangular), size: CGSize(width: 160, height: 72), name: "cal_lock", dark: false)
        render(CalendarWidgetView(entry: CalendarEntry(date: now, events: ev), family: .accessoryRectangular), size: CGSize(width: 160, height: 72), name: "cal_lock_dark", dark: true)
        render(CalendarWidgetView(entry: CalendarEntry(date: now, events: []), family: .accessoryRectangular), size: CGSize(width: 160, height: 72), name: "cal_lock_empty", dark: true)
        XCTAssertTrue(FileManager.default.fileExists(atPath: "\(outDir)/cal_medium.png"))
    }
}
