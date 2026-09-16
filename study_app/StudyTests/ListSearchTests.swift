// 많은 질문의 한글 검색과 명단 교체 전 오류·제외 학생 수를 확인함.
import XCTest
@testable import Desk
final class ListSearchTests:XCTestCase {
    func test_한글조합형과공백검색() {
        let records=(0..<200).map { "질문 \($0) 기후" }
        XCTAssertEqual(records.filter{ListSearch.matches("기후 199".decomposedStringWithCanonicalMapping,fields:[$0])}.count,1)
        XCTAssertTrue(ListSearch.matches("",fields:[]))
    }
    func test_명단교체차이와잘못된줄() {
        let old=[RosterEntry(h:RosterHash.h(sid:"10101",name:"가나"),sid:"10101",name:"가나",at:0),RosterEntry(h:RosterHash.h(sid:"10102",name:"다라"),sid:"10102",name:"다라",at:0)]
        let change=RosterChange(existing:old,text:"10101 가나\n10103 마바\n잘못된 줄\n10103 마바")
        XCTAssertEqual(change.kept.count,1);XCTAssertEqual(change.added.count,1);XCTAssertEqual(change.removed.map(\.sid),["10102"]);XCTAssertEqual(change.invalidLines,[3]);XCTAssertEqual(change.duplicateIDs,["10103"])
    }
}
