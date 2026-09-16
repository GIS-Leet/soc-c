// 가로 모드 — 자료 미리보기 전체 화면(전자칠판 미러링)과 세로 복귀, 주요 탭의 가로 표시
import XCTest

final class OrientationTests: XCTestCase {
    var app: XCUIApplication!
    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication(); app.launchEnvironment["UITEST"] = "1"
    }
    override func tearDown() { XCUIDevice.shared.orientation = .portrait }
    func shot(_ name: String) { let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a) }
    /// 앱 창이 실제로 가로로 넓어졌는지 — 스크린샷만으로는 시뮬레이터 표시 문제와 구분이 안 된다
    func assertLandscape(_ where_: String) {
        let f = app.frame
        print("[방향] \(where_) 앱 창 \(Int(f.width))x\(Int(f.height))")
        XCTAssertGreaterThan(f.width, f.height, "\(where_): 앱 창이 가로로 넓어져야 한다")
    }

    func test_자료_미리보기_가로_전체화면() {
        app.launchEnvironment["UITEST_HTML"] = "1"
        app.launch()
        let close = app.buttons["닫기"]
        XCTAssertTrue(close.waitForExistence(timeout: 12), "세로: 미리보기 닫기 버튼")
        shot("preview_portrait")

        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(3)
        assertLandscape("자료 미리보기")
        shot("preview_landscape_full")
        XCTAssertFalse(close.isHittable, "가로: 전체 화면이라 도구 막대가 숨는다")

        app.tap()   // 화면을 한 번 누르면 도구 막대 복귀
        sleep(2)
        XCTAssertTrue(close.isHittable, "가로: 눌러서 도구 막대 복귀")
        shot("preview_landscape_chrome")

        XCUIDevice.shared.orientation = .portrait
        sleep(3)
        XCTAssertTrue(close.isHittable, "세로로 돌아오면 원래대로")
        shot("preview_portrait_back")
    }

    func test_주요_화면_가로() {
        app.launch()
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(3)
        assertLandscape("탭 화면")
        for (tab, name) in [("오늘", "today"), ("노트", "notes"), ("공부", "study"), ("더보기", "more")] {
            let b = app.tabBars.buttons[tab]
            XCTAssertTrue(b.waitForExistence(timeout: 10), "가로에서 \(tab) 탭")
            b.tap(); sleep(2); shot("land_\(name)")
        }
    }
}
