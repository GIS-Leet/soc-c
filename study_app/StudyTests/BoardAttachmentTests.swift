// 외부 출처·HTTP·비슷한 경로로 인증 헤더가 전달되지 않도록 검사함.
import XCTest
@testable import Desk
final class BoardAttachmentTests: XCTestCase {
    func testExactEndpointOnly() {
        XCTAssertEqual(BoardAttachmentPolicy.access(URL(string:"https://us-central1-soc-c-qna.cloudfunctions.net/boardAttachment?board=questions&id=a")!),.authenticated)
        for value in ["http://us-central1-soc-c-qna.cloudfunctions.net/boardAttachment","https://us-central1-soc-c-qna.cloudfunctions.net.evil.invalid/boardAttachment","https://us-central1-soc-c-qna.cloudfunctions.net/boardAttachment/other","https://user@us-central1-soc-c-qna.cloudfunctions.net/boardAttachment"] {
            XCTAssertEqual(BoardAttachmentPolicy.access(URL(string:value)!),.rejected)
        }
        XCTAssertEqual(BoardAttachmentPolicy.access(URL(string:"https://firebasestorage.googleapis.com/v0/b/soc-c-qna.firebasestorage.app/o/old.png?token=fixture")!),.publicLegacy)
    }
}
