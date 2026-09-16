// Q&A·진도 파싱, PC(WebCrypto)와 호환되는 상담 암호화 테스트
import XCTest
@testable import Desk

final class Stage3Tests: XCTestCase {
    func test_질문_파싱_답변판정_정렬() {
        let q = Question.parse(["a": ["title": "A", "text": "t", "timestamp": 100.0, "replies": ["r1": ["text": "ok", "time": "x", "isTeacher": true]]],
                                "b": ["title": "B", "text": "t", "timestamp": 300.0, "isSecret": true],
                                "c": ["text": "no title", "timestamp": 200.0, "imageUrl": ""]])
        XCTAssertEqual(q.map(\.id), ["b", "c", "a"])
        XCTAssertTrue(q[2].answered); XCTAssertFalse(q[0].answered); XCTAssertTrue(q[0].isSecret); XCTAssertNil(q[1].imageUrl); XCTAssertEqual(q[1].author, "익명")
    }
    func test_대댓글_파싱과_확인상태() {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"
        let readAt = f.date(from: "2026-06-12 14:00")!.timeIntervalSince1970 * 1000
        let q = Question.parse(["a": ["title": "A", "text": "t", "timestamp": 1.0, "readAt": readAt,
            "replies": ["r1": ["text": "답", "time": "2026/06/12 PM 1:16", "isTeacher": true, "subReplies": ["s1": ["author": "익명", "text": "감사합니다", "time": "2026/06/12 PM 3:50"]]]]]])[0]
        XCTAssertEqual(q.replies[0].subReplies.first?.text, "감사합니다")
        XCTAssertEqual(q.readState, .read)   // 14:00 확인 ≥ 13:16 답변
        var later = q; later.replies.append(Reply(id: "r2", text: "추가", time: "2026/06/12 PM 5:00", isTeacher: true))
        XCTAssertEqual(later.readState, .done); XCTAssertTrue(later.readLabel.hasPrefix("확인 후 답변 추가"))
        var none = q; none.readAt = 0; XCTAssertEqual(none.readState, .done); XCTAssertEqual(none.readLabel, "답변 완료 · 미확인")
        var wait = q; wait.replies = []; XCTAssertEqual(wait.readState, .wait)
        XCTAssertEqual(Question.parseTime("2026/06/12 PM 1:16"), f.date(from: "2026-06-12 13:16")!.timeIntervalSince1970 * 1000)
        XCTAssertEqual(Question.parseTime("2026/06/12 AM 12:05"), f.date(from: "2026-06-12 00:05")!.timeIntervalSince1970 * 1000)
    }
    func test_시간_문자열_PC형식() {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"
        XCTAssertEqual(Question.timeString(f.date(from: "2026-09-09 19:05")!), "2026/09/09 PM 7:05")
        XCTAssertEqual(Question.timeString(f.date(from: "2026-09-09 00:30")!), "2026/09/09 AM 12:30")
    }
    func test_진도_파싱_다음차시() {
        let p = Progress.parse(["lessons": ["l2": ["order": 2, "title": "둘"], "l1": ["order": 1, "title": "하나"]], "classes": ["c": ["name": "1반", "order": 1, "done": 1]], "exam": ["label": "중간고사", "date": "2026-10-01"]])
        XCTAssertEqual(p.lessons.map(\.title), ["하나", "둘"]); XCTAssertEqual(p.next(for: p.classes[0])?.title, "둘"); XCTAssertEqual(p.examLabel, "중간고사")
        XCTAssertNil(p.next(for: ProgressClass(id: "x", name: "", order: 0, done: 2, period: 0, day: 0)))
    }
    // Python(hashlib PBKDF2 + AES-GCM)으로 만든 벡터 — PC WebCrypto와 같은 파라미터
    let pass = "test-pass-1234", salt = "0JGWgqSOd6IPqjtvjwKJhQ==", iv = "AAECAwQFBgcICQoL"
    func test_PC_암호문_복호화() throws {
        let key = try XCTUnwrap(ClassCrypto.key(pass: pass, saltB64: salt))
        XCTAssertEqual(try ClassCrypto.decrypt(.init(iv: iv, ct: "vVX2hub43WxsiVKm4NbZa3JTOwIyYp1n+fNJSi9Ttcgfg4IJ"), key: key) as? String, ClassCrypto.checkText)
        let obj = try ClassCrypto.decrypt(.init(iv: iv, ct: "5BD9nOyohj410hGnpt3LbToHMAK893Q9YHNGnCGeSFEnRx1PVv+ZJqAwk5n76jCningn49v115wwcUCTKEHAdbinhHCX+hGXXFc0FsD+vSdUP32GGxc0LwgJoeKIEANAA8Y28VnWcr+isCp8WS07X0jSHnaWi+BYaMomaXNshKZnDGY+"), key: key)
        let s = try XCTUnwrap(Student.from("id", obj))
        XCTAssertEqual(s.name, "홍길동"); XCTAssertEqual(s.num, "12"); XCTAssertEqual(s.logs.first?.tag, "상담"); XCTAssertEqual(s.logs.first?.text, "상담 내용")
    }
    func test_틀린_암호는_실패() throws {
        let key = try XCTUnwrap(ClassCrypto.key(pass: "wrong-pass", saltB64: salt))
        XCTAssertThrowsError(try ClassCrypto.decrypt(.init(iv: iv, ct: "vVX2hub43WxsiVKm4NbZa3JTOwIyYp1n+fNJSi9Ttcgfg4IJ"), key: key))
    }
    func test_암호화_왕복() throws {
        let key = try XCTUnwrap(ClassCrypto.key(pass: pass, saltB64: salt))
        let s = Student(id: "x", num: "3", name: "김철수", note: "메모\n둘째 줄", logs: [StudentLog(id: 0, date: "2026-09-09", text: "관찰 내용", tag: "관찰")])
        let blob = try ClassCrypto.encrypt(s.plain, key: key)
        XCTAssertEqual(Student.from("x", try ClassCrypto.decrypt(blob, key: key)), s)
    }
}
