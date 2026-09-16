// Apple 캘린더 동기화 계획(순수 함수) 테스트
import XCTest
@testable import Desk

final class CalendarSyncTests: XCTestCase {
    typealias D = CalendarPlan.DeskItem; typealias E = CalendarPlan.EKItem
    let t0 = Date(timeIntervalSince1970: 1_000_000), old = Date(timeIntervalSince1970: 900_000), new = Date(timeIntervalSince1970: 1_100_000)
    func test_제목_텍스트_변환() {
        XCTAssertEqual(CalendarPlan.title(of: "16:30 교과협의회"), "교과협의회")
        XCTAssertEqual(CalendarPlan.title(of: "오후 4시 30분 회의"), "회의")
        XCTAssertEqual(CalendarPlan.title(of: "진로 상담 주간"), "진로 상담 주간")
        XCTAssertEqual(CalendarPlan.text(title: "회의", minutes: 9 * 60 + 5), "09:05 회의")
        XCTAssertEqual(CalendarPlan.text(title: "종일", minutes: nil), "종일")
    }
    func test_계획_생성_갱신_삭제() {
        let desk = [D(date: "2026-09-10", id: "a", text: "16:30 회의"), D(date: "2026-09-11", id: "b", text: "새 일정"), D(date: "2026-09-12", id: "c", text: "지운 적 있음")]
        let ek = [E(ekID: "e1", tag: "2026-09-10/a", title: "회의", date: "2026-09-10", minutes: 16 * 60 + 30, modified: old),   // 동일 → 변경 없음
                  E(ekID: "e2", tag: "2026-09-09/z", title: "옛날", date: "2026-09-09", minutes: nil, modified: old),          // desk에 없음 → EK 삭제
                  E(ekID: "e3", tag: nil, title: "애플에서 만든 것", date: "2026-09-13", minutes: 10 * 60, modified: new)]        // 태그 없음 → desk 생성
        let p = CalendarPlan.plan(desk: desk, ek: ek, mirrored: ["2026-09-10/a", "2026-09-12/c"], lastSync: t0, verifiedAbsent: ["2026-09-12/c"])
        XCTAssertEqual(p.createEK.map(\.id), ["b"])          // 새 desk 일정 → EK 생성
        XCTAssertEqual(p.deleteDesk.map(\.id), ["c"])        // 미러링했었는데 EK에 없음 → Apple에서 지움 → desk 삭제
        XCTAssertEqual(p.deleteEK.map(\.ekID), ["e2"])
        XCTAssertEqual(p.createDesk.map(\.ekID), ["e3"]); XCTAssertEqual(p.createDesk[0].deskText, "10:00 애플에서 만든 것")
        XCTAssertTrue(p.updateEK.isEmpty && p.updateDesk.isEmpty)
    }
    func test_충돌은_마지막_동기화_이후_애플_수정이_우선() {
        let desk = [D(date: "2026-09-10", id: "a", text: "16:30 회의"), D(date: "2026-09-11", id: "b", text: "발표")]
        let ek = [E(ekID: "e1", tag: "2026-09-10/a", title: "회의(변경)", date: "2026-09-10", minutes: 17 * 60, modified: new),   // 애플에서 최근 수정 → desk 갱신
                  E(ekID: "e2", tag: "2026-09-11/b", title: "발표 옛제목", date: "2026-09-11", minutes: nil, modified: old)]     // 오래된 EK → desk 내용으로 EK 갱신
        let p = CalendarPlan.plan(desk: desk, ek: ek, mirrored: [], lastSync: t0)
        XCTAssertEqual(p.updateDesk.map { $0.0.id }, ["a"]); XCTAssertEqual(p.updateDesk[0].1.deskText, "17:00 회의(변경)")
        XCTAssertEqual(p.updateEK.map { $0.1.id }, ["b"])
    }
    func test_불완전수신과범위밖일정은삭제하지않는다() {
        let desk = [D(date: "2020-01-01", id: "past", text: "보존"), D(date: "2026-09-10", id: "a", text: "확인 전"), D(date: "2030-01-01", id: "future", text: "보존")]
        let keys = Set(desk.map(\.key))
        let incomplete = CalendarPlan.plan(desk: [], ek: [E(ekID: "e", tag: "2026-09-10/a", title: "일정", date: "2026-09-10", minutes: nil, modified: old)], mirrored: keys, lastSync: t0, complete: false)
        XCTAssertTrue(incomplete.deleteEK.isEmpty)
        let scoped = CalendarPlan.plan(desk: desk, ek: [], mirrored: keys, lastSync: t0, window: "2026-01-01"..."2027-01-01", verifiedAbsent: keys)
        XCTAssertEqual(scoped.deleteDesk.map(\.id), ["a"])
        XCTAssertTrue(CalendarPlan.plan(desk: desk, ek: [], mirrored: keys, lastSync: t0).deleteDesk.isEmpty)
    }
    func test_범위밖으로이동한이벤트는기존ID로이동한다() {
        let d = D(date: "2026-09-10", id: "stable", text: "일정")
        let e = E(ekID: "e", tag: d.key, title: "일정", date: "2028-01-01", minutes: nil, modified: new)
        let plan = CalendarPlan.plan(desk: [d], ek: [e], mirrored: [d.key], lastSync: t0, window: "2026-01-01"..."2027-01-01")
        XCTAssertEqual(plan.updateDesk.first?.0.id, "stable")
        XCTAssertTrue(plan.deleteDesk.isEmpty)
    }

    func test_자기EventKit저장을외부수정으로오인하지않는다() {
        let d = D(date: "2026-09-10", id: "a", text: "새 Desk 제목")
        let e = E(ekID: "e", tag: d.key, title: "이전 제목", date: d.date, minutes: nil, modified: new)
        let plan = CalendarPlan.plan(desk: [d], ek: [e], mirrored: [d.key], lastSync: old, ownWrites: ["e": CalendarPlan.signature(e)])
        XCTAssertEqual(plan.updateEK.first?.1.text, "새 Desk 제목"); XCTAssertTrue(plan.updateDesk.isEmpty)
        for kind in ["import", "move", "updateDesk"] { XCTAssertFalse(CalendarPlan.rewritesEvent(kind)) }
        XCTAssertTrue(CalendarPlan.rewritesEvent("updateEK"))
    }

}
