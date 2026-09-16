// 공부 화면 — study.html(앱 모드). 완료 신호를 받으면 회차 완료·자물쇠 해제
import SwiftUI

struct StudyWebView: View {
    let slot: Int
    let mode: String
    let onDone: () -> Void
    var body: some View {
        var comps = URLComponents(string: "https://nyuheatgis.com/study.html")!
        comps.queryItems = [.init(name: "app", value: "1"), .init(name: "slot", value: String(slot)), .init(name: "mode", value: mode), .init(name: "t", value: String(Int(Date().timeIntervalSince1970)))]
        return BridgeWebView(url: comps.url!) { body in if body["done"] as? Bool == true { onDone() } }
    }
}
