// 카드 서재 — 과목별 필드 읽기(문자열·목록·가나 글자표), 오늘까지 공부한 범위, 아무 카드 뽑기(안 읽은 것 우선)
import XCTest
@testable import Desk

final class CardLibraryTests: XCTestCase {
    func day(_ s: String) -> Date { FB.day.date(from: s)! }

    func test_과목별_필드_읽기() {
        let geo = Data(#"{"start":"2026-09-08","days":[{"c":"지형","t":"동적 평형","en":"dynamic equilibrium","m":"한 줄","a":"정리","k":[["침식윤회","설명1"],["정상 상태","설명2"]],"x":"더 깊이","r":"Hack 1960","d":"자세한 설명"}]}"#.utf8)
        let g = CardLibrary.parse(subject: "지리", json: geo)!.cards[0]
        XCTAssertEqual(g.kind, .geo); XCTAssertEqual(g.title, "동적 평형"); XCTAssertEqual(g.text["d"], "자세한 설명")
        XCTAssertEqual(g.lists["k"]?.count, 2); XCTAssertEqual(g.lists["k"]?[1][0], "정상 상태"); XCTAssertEqual(g.subtitle, "한 줄"); XCTAssertEqual(g.id, "지리-1")

        let jp = Data(#"{"start":"2026-09-08","days":[{"type":"kana","t":"히라가나 ①","rows":["あいうえお","かきくけこ"],"m":"모음","g":"외우는 법","w":[["あい","사랑"]]},{"t":"아침 인사","s":"おはようございます。","m":"안녕하세요","v":[["おはよう","","안녕"]],"g":"설명","e":["せんせい、おはようございます。","선생님, 안녕하세요."],"w":[["あさ","아침"]],"e2":[["こんばんは。","안녕하세요."]]}]}"#.utf8)
        let deck = CardLibrary.parse(subject: "일본어", json: jp)!
        XCTAssertEqual(deck.cards[0].kind, .kana); XCTAssertEqual(deck.cards[0].rows, ["あいうえお", "かきくけこ"])
        let s = deck.cards[1]
        XCTAssertEqual(s.kind, .jpSentence); XCTAssertEqual(s.subtitle, "おはようございます。")
        XCTAssertEqual(s.lists["e"], [["せんせい、おはようございます。", "선생님, 안녕하세요."]])   // 한 쌍짜리 예문도 목록으로
        XCTAssertEqual(s.lists["v"]?[0].count, 3); XCTAssertEqual(s.lists["e2"]?.count, 1)

        let en = Data(#"{"start":"2026-09-12","days":[{"t":"인사","s":"How's it going?","m":"잘 지내?","p":"쓰임","d":[["A","Hey, how's it going?","안녕"],["B","Pretty good.","괜찮아"]],"v":[["Not bad.","나쁘지 않아"]],"x":"going 에 강세"}]}"#.utf8)
        let e = CardLibrary.parse(subject: "영어", json: en)!.cards[0]
        XCTAssertEqual(e.kind, .english); XCTAssertEqual(e.lists["d"]?[1][1], "Pretty good."); XCTAssertNil(e.text["d"])   // 영어 d 는 대화 목록
        XCTAssertTrue(e.matches("pretty")); XCTAssertTrue(e.matches("강세")); XCTAssertFalse(e.matches("몬순"))
        XCTAssertNil(CardLibrary.parse(subject: "영어", json: Data("{}".utf8)))
    }

    func test_오늘까지_범위와_아무_카드() {
        let json = Data(#"{"start":"2026-09-12","days":[{"t":"A"},{"t":"B"},{"t":"C"},{"t":"D"},{"t":"E"}]}"#.utf8)
        let deck = CardLibrary.parse(subject: "영어", json: json)!
        XCTAssertEqual(deck.studied(day("2026-09-14")).map(\.title), ["A", "B", "C"])
        XCTAssertEqual(deck.todayIndex(day("2026-09-14")), 2)
        XCTAssertEqual(deck.studied(day("2026-09-30")).count, 5); XCTAssertEqual(deck.todayIndex(day("2026-09-18")), 1)   // 두 바퀴째
        XCTAssertTrue(deck.studied(day("2026-09-10")).isEmpty); XCTAssertNil(deck.todayIndex(day("2026-09-10")))

        let now = day("2026-09-14")
        XCTAssertEqual(CardLibrary.pick([deck], now: now, read: ["영어-1", "영어-2"], random: { _ in 0 })?.title, "C")   // 공부한 것 중 안 읽은 것
        XCTAssertEqual(CardLibrary.pick([deck], now: now, read: ["영어-1", "영어-2", "영어-3"], random: { $0 - 1 })?.title, "C")   // 다 읽었으면 공부한 것 전체
        XCTAssertEqual(CardLibrary.pick([deck], now: day("2026-09-01"), read: [], random: { $0 - 1 })?.title, "E")   // 시작 전이면 전체
        XCTAssertNil(CardLibrary.pick([], now: now, read: []))
    }
}
