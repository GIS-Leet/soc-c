// 색 체계 — 반 번호 해석과 팔레트 순환
import XCTest
import SwiftUI
@testable import Desk

final class DeskColorsTests: XCTestCase {
    func test_classNumber_from_subject_uses_room_last_two_digits() {
        XCTAssertEqual(DeskColors.classNumber(subject: "103 통사2C"), 3)
        XCTAssertEqual(DeskColors.classNumber(subject: "112 통사2C"), 12)
        XCTAssertNil(DeskColors.classNumber(subject: "통사2C"))          // 교실 없음
        XCTAssertNil(DeskColors.classNumber(subject: "100 통사2C"))      // 00 반은 없음
        XCTAssertNil(DeskColors.classNumber(subject: "1층 통사"))
    }
    func test_classNumber_from_name_takes_last_digit_group() {
        XCTAssertEqual(DeskColors.classNumber(name: "3반"), 3)
        XCTAssertEqual(DeskColors.classNumber(name: "2학년 7반"), 7)
        XCTAssertEqual(DeskColors.classNumber(name: "12"), 12)
        XCTAssertNil(DeskColors.classNumber(name: "통사"))
    }
    func test_palette_cycles_and_room_matches_name() {
        XCTAssertEqual(DeskColors.classHues.count, 12)
        XCTAssertEqual(DeskColors.cls(1, dark: false), DeskColors.cls(13, dark: false))   // 12색 순환
        XCTAssertNotEqual(DeskColors.cls(2, dark: false), DeskColors.cls(10, dark: false))
        XCTAssertNotEqual(DeskColors.cls(3, dark: false), DeskColors.cls(3, dark: true))
        XCTAssertNil(DeskColors.cls(nil, dark: false)); XCTAssertNil(DeskColors.cls(0, dark: false))
        // 교실 103 의 시간표 색과 진도표 "3반" 의 색이 같아야 한다
        XCTAssertEqual(DeskColors.cls(subject: "103 통사2C", scheme: .light), DeskColors.cls(name: "3반", scheme: .light))
    }
    func test_assets_exist_in_bundle() {
        for n in ["AccentColor", "DeskLive", "DeskSuccess", "DeskWarn", "DeskBrand"] { XCTAssertNotNil(UIColor(named: n, in: Bundle(for: Desk.DeskStore.self), compatibleWith: nil), n) }
    }
}
