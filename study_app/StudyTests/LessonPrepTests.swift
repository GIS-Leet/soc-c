// 수업 준비·답변 도우미 로직
import XCTest
@testable import Desk

final class LessonPrepTests: XCTestCase {
    func d(_ s: String) -> Date { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)! }
    let lessons = [Lesson(id: "l1", order: 1, title: "세계화의 양상 ① 공간적 분업과 세계도시", unit: "세계화의 양상과 문제의 해결"), Lesson(id: "l2", order: 2, title: "세계화의 문제점과 해결 방안", unit: "세계화의 양상과 문제의 해결"), Lesson(id: "l3", order: 3, title: "국제 갈등과 평화, 행위 주체", unit: "국제 사회의 갈등과 평화")]
    var classes: [ProgressClass] { [ProgressClass(id: "c3", name: "3반", order: 1, done: 1, period: 2, day: 5), ProgressClass(id: "c7", name: "7반", order: 2, done: 3, period: 2, day: 3)] }
    var files: [GHFile] { [GHFile(name: "tb_세계화.html", path: "수업/tb_세계화.html", sha: "a", size: 1, downloadURL: nil), GHFile(name: "slides_인권.html", path: "수업/slides_인권.html", sha: "b", size: 1, downloadURL: nil), GHFile(name: "세계화 문제점 학습지.pdf", path: "학습자료/세계화 문제점 학습지.pdf", sha: "c", size: 1, downloadURL: nil), GHFile(name: "2026-09-04 3반 1차시 세계화-필기.pdf", path: "수업/x.pdf", sha: "d", size: 1, downloadURL: nil)] }
    func test_교실_반_매칭() {
        XCTAssertEqual(LessonPrep.room(of: "103 통사2C"), "103"); XCTAssertEqual(LessonPrep.classNumber(room: "113"), 13); XCTAssertNil(LessonPrep.classNumber(room: "통사"))
        XCTAssertEqual(LessonPrep.progressClass(for: "103", in: classes)?.id, "c3"); XCTAssertNil(LessonPrep.progressClass(for: "205", in: classes))
    }
    func test_자료_추천() {
        let m = LessonPrep.match(lesson: lessons[1], files: files)
        XCTAssertEqual(m.first?.name, "세계화 문제점 학습지.pdf")                 // 제목 낱말이 더 많이 겹침
        XCTAssertTrue(m.map(\.name).contains("tb_세계화.html")); XCTAssertFalse(m.map(\.name).contains("slides_인권.html"))
        XCTAssertLessThan(m.firstIndex { $0.name == "tb_세계화.html" }!, m.firstIndex { $0.name.contains("-필기") } ?? 99)   // 필기본은 뒤로
    }
    func test_계획_지금_다음_내일() {
        let t = Desk.Timetable(days: ["fri": [2: "103 통사2C", 4: "107 통사2C"], "mon": [1: "111 통사2C"]])
        let pr = Progress(lessons: lessons, classes: classes)
        let now = LessonPrep.plan(table: t, progress: pr, files: files, now: d("2026-09-11 09:30"))!   // 금 2교시 중
        XCTAssertTrue(now.isNow); XCTAssertEqual(now.cls?.name, "3반"); XCTAssertEqual(now.lesson?.order, 2); XCTAssertEqual(now.context.fileName, "2026-09-11 3반 2차시 세계화의문제점과해결방안-필기.pdf")
        let next = LessonPrep.plan(table: t, progress: pr, files: files, now: d("2026-09-11 10:30"))!  // 금 4교시 전
        XCTAssertFalse(next.isNow); XCTAssertEqual(next.room, "107"); XCTAssertEqual(next.cls?.name, "7반"); XCTAssertNil(next.lesson)   // 7반은 진도 완료
        let mon = LessonPrep.plan(table: t, progress: pr, files: files, now: d("2026-09-11 17:00"))!   // 하교 후 → 월 1교시
        XCTAssertEqual(mon.room, "111"); XCTAssertEqual(FB.key(mon.date), "2026-09-14"); XCTAssertNil(mon.cls)
        XCTAssertNil(LessonPrep.plan(table: nil, progress: pr, files: files))
    }
    func test_답변도우미_유사질문과_자료() {
        let base = { (id: String, t: String, x: String, a: String?) -> Question in Question(id: id, title: t, text: x, author: "s", time: "", timestamp: 0, isSecret: false, imageUrl: nil, replies: a.map { [Reply(id: "r", text: $0, time: "", isTeacher: true)] } ?? []) }
        let q = base("q", "세계도시 질문", "세계도시가 왜 생기는지 궁금해요", nil)
        let all = [q, base("a", "세계도시 뜻", "세계도시는 무엇인가요", "다국적 기업 본사와 금융이 모인 도시예요."), base("b", "인구 피라미드", "인구 피라미드 읽는 법", "밑이 넓으면…"), base("c", "세계도시 예", "세계도시 예시 알려주세요", nil)]
        let r = QAAssist.related(q, in: all)
        XCTAssertEqual(r.map(\.q.id), ["a"])                                   // c 는 답이 없어 제외, b 는 무관
        XCTAssertEqual(QAAssist.materials(q, files: files).map(\.name), [])    // '세계화' ≠ '세계도시'
        let q2 = base("q2", "세계화 문제점", "세계화 문제점이 뭐예요", nil)
        XCTAssertEqual(QAAssist.materials(q2, files: files).first?.name, "세계화 문제점 학습지.pdf")
    }
}
