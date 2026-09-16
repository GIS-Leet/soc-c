// 리다이렉트·서브프레임·비슷한 호스트에는 교사 인증 토큰을 주지 않음.
import XCTest
@testable import Desk
final class BridgeOriginTests: XCTestCase {
    func testAllowedPages() {
        XCTAssertTrue(BridgeTrust.allows(URL(string:"https://nyuheatgis.com/study.html?app=1&slot=2")))
        for url in ["http://nyuheatgis.com/study.html","https://nyuheatgis.com.evil.invalid/study.html","https://nyuheatgis.com/qna.html","https://nyuheatgis.com/study.html/","https://user@nyuheatgis.com/study.html","https://nyuheatgis.com:8443/study.html"] { XCTAssertFalse(BridgeTrust.allows(URL(string:url)),url) }
    }
    func testMainFrameAndOriginBothRequired() {
        let url=URL(string:"https://nyuheatgis.com/study.html")!
        XCTAssertFalse(BridgeTrust.allowsMessage(mainFrame:false,scheme:"https",host:"nyuheatgis.com",port:443,url:url))
        XCTAssertFalse(BridgeTrust.allowsMessage(mainFrame:true,scheme:"https",host:"evil.invalid",port:443,url:url))
        XCTAssertTrue(BridgeTrust.allowsMessage(mainFrame:true,scheme:"https",host:"nyuheatgis.com",port:443,url:url))
    }
}
