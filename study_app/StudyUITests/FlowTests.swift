// 화면 흐름 테스트 — 픽스처(UITEST) 모드로 앱을 띄워 핵심 흐름이 실제로 뜨는지 확인. 로직 테스트가 못 잡는 "화면이 안 뜸"을 잡는다
import XCTest

final class FlowTests: XCTestCase {
    var app: XCUIApplication!
    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication(); app.launchEnvironment["UITEST"] = "1"; app.launchEnvironment["UITEST_NOW"] = "2026-09-11 10:00"; app.launchEnvironment["UITEST_FAILURE"] = "offline"; app.launch()
    }
    func tab(_ name: String) {
        if app.tabBars.firstMatch.waitForExistence(timeout: 2) { phoneTab(name) } else { sidebar(name) }
    }
    func phoneTab(_ name: String) { let button = app.tabBars.buttons[name]; XCTAssertTrue(button.waitForExistence(timeout: 8), "탭 \(name)"); button.tap() }
    func sidebar(_ name: String) { let label = app.staticTexts[name].firstMatch; XCTAssertTrue(label.waitForExistence(timeout: 8), "사이드바 \(name)"); label.tap() }
    func test_오늘_수업준비_카드() {
        XCTAssertTrue(app.staticTexts["시간표"].waitForExistence(timeout: 8) || app.staticTexts["할 일"].exists || app.otherElements["오늘 교시 띠"].exists, "띠·무대·오늘 전체")
        XCTAssertTrue(app.staticTexts["2학년 수행평가 채점"].waitForExistence(timeout: 5), "할 일 픽스처")
    }
    func test_달력_월간() {
        app.terminate(); app.launchEnvironment["UITEST_NOW"] = "2026-09-11 10:00"; app.launch()
        let open = app.navigationBars.buttons["달력"]; XCTAssertTrue(open.waitForExistence(timeout: 8), "오늘 화면 달력 버튼"); open.tap()
        XCTAssertTrue(app.navigationBars["2026년 9월"].waitForExistence(timeout: 8), "달력 제목")
        XCTAssertTrue(app.staticTexts["교과협의회"].waitForExistence(timeout: 5), "고른 날(오늘) 일정")
        XCTAssertTrue(app.staticTexts["안내문 배부"].exists)
        let d12 = app.buttons["day-2026-09-12"]; XCTAssertTrue(d12.exists); d12.tap()
        XCTAssertTrue(app.staticTexts["동아리 발표회"].waitForExistence(timeout: 5), "다른 날 누르면 목록 바뀜")
        app.navigationBars.buttons["다음 달"].tap()
        XCTAssertTrue(app.navigationBars["2026년 10월"].waitForExistence(timeout: 5), "다음 달")
        let d1 = app.buttons["day-2026-10-01"]; XCTAssertTrue(d1.waitForExistence(timeout: 5)); d1.tap()
        XCTAssertTrue(app.staticTexts["2차 지필평가"].waitForExistence(timeout: 5), "디데이 표시")
    }
    func test_노트_작성() {
        tab("노트")
        XCTAssertTrue(app.staticTexts["세계화 수업 메모"].waitForExistence(timeout: 8))
        app.staticTexts["세계화 수업 메모"].tap()
        XCTAssertTrue(app.navigationBars.element.waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["세계화 수업 메모"].waitForExistence(timeout: 5))
    }
    func test_질문_답변도우미() {
        tab("수업")
        let qa = app.staticTexts["학생 질문"]; XCTAssertTrue(qa.waitForExistence(timeout: 8), "수업 탭의 학생 질문"); qa.tap()
        XCTAssertTrue(app.navigationBars["학생 질문"].waitForExistence(timeout: 8), "질문 목록으로 이동")
        let q = app.staticTexts["세계도시 질문"]; XCTAssertTrue(q.waitForExistence(timeout: 8)); sleep(1); q.tap()
        if !app.staticTexts["답변 도우미"].waitForExistence(timeout: 6) { q.tap() }   // 밀어 들어오는 중에 눌리면 한 번 더
        XCTAssertTrue(app.staticTexts["답변 도우미"].waitForExistence(timeout: 8), "도우미 카드")
        XCTAssertTrue(app.buttons["이 답을 초안으로"].waitForExistence(timeout: 5), "유사 답 제안")
        app.buttons["이 답을 초안으로"].tap()
        let field = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 3))
    }
    func test_공부_설정() {
        tab("공부"); XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout: 8))
        if app.tabBars.firstMatch.exists {
            phoneTab("더보기")
            let row = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS '설정'")).firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 8)); row.tap()
        } else { sidebar("설정") }
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH '교시 시간'")).firstMatch.waitForExistence(timeout: 8), "교시 시간 항목")
        app.swipeUp(); app.swipeUp()
        XCTAssertTrue(app.staticTexts["동기화"].waitForExistence(timeout: 5) || app.staticTexts["백업"].exists || app.staticTexts["정보"].exists)
    }
    func test_노트_필기_화면() {
        tab("노트")
        app.staticTexts["세계화 수업 메모"].tap()
        let ink = app.buttons["손글씨"].firstMatch
        XCTAssertTrue(ink.waitForExistence(timeout: 5), "손글씨 열기"); ink.tap(); XCTAssertTrue(app.buttons["펜"].waitForExistence(timeout: 8) || app.images["pencil.tip"].exists, "필기 도구")
    }
    func test_강의_영상_명단() {
        tab("수업")
        let v = app.staticTexts["강의 영상"]; XCTAssertTrue(v.waitForExistence(timeout: 8), "수업 탭의 강의 영상"); v.tap()
        XCTAssertTrue(app.navigationBars["강의 영상"].waitForExistence(timeout: 8))
        let row = app.staticTexts["세계화의 양상"]; XCTAssertTrue(row.waitForExistence(timeout: 8), "영상 픽스처"); sleep(1); shot("lecture-list"); row.tap()
        XCTAssertTrue(app.staticTexts["시청 1 / 명단 2 · 완료 0"].waitForExistence(timeout: 8), "시청 현황 헤더"); sleep(2); shot("lecture-detail")
        app.navigationBars.buttons.element(boundBy: 0).tap(); XCTAssertTrue(app.navigationBars["강의 영상"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let r = app.staticTexts["홈페이지 명단"]; XCTAssertTrue(r.waitForExistence(timeout: 8)); r.tap()
        XCTAssertTrue(app.staticTexts["인증 1 / 2"].waitForExistence(timeout: 8), "명단 헤더"); sleep(1); shot("roster")
    }
    func shot(_ name: String) { let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
}
