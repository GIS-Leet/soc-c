// 백업·캐시 재귀 처리에서 가짜 자격 증명을 제거하고 학습 데이터를 유지함.
import XCTest
@testable import Desk
final class BackupPrivacyTests:XCTestCase {
    func test_자격은재귀적으로제외한다() throws {
        let input:[String:Any]=["repo":"fixture/repo","token":"fixture-PAT","nested":["refresh_token":"fixture-refresh","title":"수업"],"items":[["password":"fixture-password","text":"내용"]]]
        let safe=GitHubCredential.safeSnapshot(input)
        let data=try JSONSerialization.data(withJSONObject:safe),text=String(decoding:data,as:UTF8.self)
        XCTAssertFalse(text.contains("fixture-PAT"));XCTAssertFalse(text.contains("fixture-refresh"));XCTAssertFalse(text.contains("fixture-password"));XCTAssertTrue(text.contains("수업"));XCTAssertTrue(text.contains("내용"))
    }
}
