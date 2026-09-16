// 같은 수업의 재확인과 늦게 도착한 이전 차시는 진도를 증가·감소시키지 않는다.
import XCTest
@testable import Desk

final class LessonCompletionTests: XCTestCase {
    func testRepeatedLessonAndLateEarlierLesson() {
        let value:[String:Any]=["id":"same","target":5]
        let once=LessonCompletion.applying(value,to:["name":"3반","done":4])
        let twice=LessonCompletion.applying(value,to:once)
        XCTAssertEqual(twice["done"] as? Int,5)
        XCTAssertEqual((twice["completedLessons"] as? [String:Any])?.count,1)
        let late=LessonCompletion.applying(["id":"older","target":2],to:twice)
        XCTAssertEqual(late["done"] as? Int,5)
    }
    func testIdentityIncludesClassPeriodAndLesson() {
        var context=LessonContext(classID:"3",className:"3반",room:"103",lessonNo:5,lessonTitle:"세계화",date:Date(timeIntervalSince1970:1_700_000_000),period:2)
        let first=LessonCompletion.payload(context)?["id"] as? String
        XCTAssertEqual(first,LessonCompletion.payload(context)?["id"] as? String)
        context.period=3;XCTAssertNotEqual(first,LessonCompletion.payload(context)?["id"] as? String)
    }
}
