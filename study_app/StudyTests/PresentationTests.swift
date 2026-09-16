// 이전 화면의 늦은 완료·종료가 새 자료를 덮거나 닫지 못한다.
import XCTest
import PencilKit
@testable import Desk

@MainActor final class PresentationTests: XCTestCase {
    func testPreviousOwnerCannotReplaceOrClearNewPresentation() {
        let state=PresentationState();let old=UUID(),current=UUID()
        state.begin(old);state.begin(current)
        state.show(background:nil,size:CGSize(width:10,height:20),drawing:PKDrawing(),owner:current)
        state.show(background:nil,size:CGSize(width:50,height:60),drawing:PKDrawing(),owner:old)
        state.clear(owner:old)
        XCTAssertTrue(state.active);XCTAssertEqual(state.pageSize,CGSize(width:10,height:20))
        state.clear(owner:current);XCTAssertFalse(state.active)
    }
}
