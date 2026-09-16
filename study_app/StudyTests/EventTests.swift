// 일정 알림·위젯 스냅샷·Q&A 후속 질문·Live Activity 노출 규칙
import XCTest
@testable import Desk
import SwiftUI

final class EventTests: XCTestCase {
    func d(_ s: String) -> Date { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)! }
    func test_일정_텍스트_시각_분리() {
        XCTAssertEqual(WidgetEvent.split("16:30 교과협의회").minutes, 16 * 60 + 30); XCTAssertEqual(WidgetEvent.split("16:30 교과협의회").title, "교과협의회")
        XCTAssertEqual(WidgetEvent.split("오후 3시 30분 상담").minutes, 15 * 60 + 30); XCTAssertEqual(WidgetEvent.split("오전 9시 회의").title, "회의")
        XCTAssertNil(WidgetEvent.split("수행평가 안내").minutes); XCTAssertEqual(WidgetEvent.split("25:99 x").minutes, nil)
        XCTAssertEqual(WidgetEvent.split("16:30").title, "16:30")   // 제목이 없으면 원문 유지
    }
    func test_알림_계획() {
        let now = d("2026-09-11 06:00"), k = WidgetEvent.key(now), t = WidgetEvent.key(now.addingTimeInterval(86400))
        let ev = [WidgetEvent(id: "a", date: k, title: "회의", minutes: 16 * 60, source: "desk"), WidgetEvent(id: "b", date: k, title: "종일", minutes: nil, source: "desk"), WidgetEvent(id: "c", date: t, title: "치과", minutes: 9 * 60, source: "apple")]
        let items = EventAlarmPlan.items(ev, now: now)
        XCTAssertEqual(items.map(\.id), ["event-day-\(k)", "event-\(k)-a", "event-day-\(t)", "event-\(t)-c"])
        XCTAssertEqual(items[0].fire, d("2026-09-11 07:00")); XCTAssertEqual(items[0].title, "오늘 일정 2개"); XCTAssertEqual(items[0].body, "16:00 회의\n종일")
        XCTAssertEqual(items[1].fire, d("2026-09-11 15:50")); XCTAssertEqual(items[1].body, "회의")
        XCTAssertEqual(items[2].title, "내일 일정 1개")
        // 아침이 지났으면 오늘 요약은 없음, 지난 일정도 없음
        let later = EventAlarmPlan.items(ev, now: d("2026-09-11 16:30"))
        XCTAssertEqual(later.map(\.id), ["event-day-\(t)", "event-\(t)-c"])
    }
    func test_스냅샷_병합과_정렬() {
        let now = d("2026-09-11 08:00"), k = WidgetEvent.key(now)
        let desk = [k: [CalEvent(id: "x", date: k, text: "14:00 회의"), CalEvent(id: "y", date: k, text: "안내문 배부")]]
        let ext = [k: [ExternalEvent(id: "e1", title: "치과", date: k, minutes: 9 * 60, endMinutes: 10 * 60, calendar: "개인", color: Color(red: 1, green: 0, blue: 0))]]
        let snap = EventAlarm.snapshot(desk: desk, external: ext, now: now)
        XCTAssertEqual(snap.count, 3); XCTAssertEqual(Desk.WidgetEvent.on(snap, k).map(\.title), ["치과", "회의", "안내문 배부"])
        XCTAssertEqual(snap.first { $0.id == "a-e1" }?.colorHex, "FF0000")
        XCTAssertEqual(WidgetEvent.dayLabel(k, now: now), "오늘"); XCTAssertEqual(WidgetEvent.dayLabel(WidgetEvent.key(now.addingTimeInterval(86400 * 3)), now: now), "9/14 (월)")
    }
    func test_후속_질문_미답변() {
        let base = Question(id: "q", title: "t", text: "x", author: "a", time: "", timestamp: 0, isSecret: false, imageUrl: nil, replies: [])
        XCTAssertTrue(base.open)
        var q = base; q.replies = [Reply(id: "r1", text: "답", time: "", isTeacher: true)]
        XCTAssertFalse(q.open)
        q.replies[0].subReplies = [SubReply(id: "s1", author: "학생", text: "그럼?", time: "", isTeacher: false)]
        XCTAssertTrue(q.needsFollowUp); XCTAssertTrue(q.open); XCTAssertTrue(q.answered)
        q.replies[0].subReplies.append(SubReply(id: "s2", author: "관리자", text: "네", time: "", isTeacher: true))
        XCTAssertFalse(q.open)
        // 학생이 「확인했습니다」만 남김 → 교사가 '확인함' 처리하면 미답변 아님, 그 뒤 새 대댓글이 오면 다시 미답변
        q.replies[0].subReplies.append(SubReply(id: "s3", author: "학생", text: "확인했습니다", time: "2026/09/11 AM 9:10", isTeacher: false))
        XCTAssertTrue(q.open)
        q.followUpResolvedAt = Question.parseTime("2026/09/11 AM 9:12"); XCTAssertFalse(q.open)
        q.replies[0].subReplies.append(SubReply(id: "s4", author: "학생", text: "하나 더요", time: "2026/09/11 AM 9:30", isTeacher: false))
        XCTAssertTrue(q.open)
    }
    func test_라이브액티비티_노출규칙() {
        let t = Desk.Timetable(days: ["fri": [1: "통사", 2: "지리"]])   // 1교시 8:20, 2교시 9:20
        XCTAssertNil(LiveActivity.plan(t, now: d("2026-09-11 07:30")))          // 50분 전: 안 띄움
        let n = LiveActivity.plan(t, now: d("2026-09-11 08:05"))!; XCTAssertEqual(n.state.mode, "next"); XCTAssertNil(n.autoDismissAt)
        let c = LiveActivity.plan(t, now: d("2026-09-11 08:30"))!; XCTAssertEqual(c.state.mode, "now"); XCTAssertNil(c.autoDismissAt)   // 다음 수업 있음
        let last = LiveActivity.plan(t, now: d("2026-09-11 09:30"))!; XCTAssertEqual(last.state.period, 2); XCTAssertEqual(last.autoDismissAt, d("2026-09-11 10:10"))
        XCTAssertNil(LiveActivity.plan(t, now: d("2026-09-11 11:00")))
    }
}
