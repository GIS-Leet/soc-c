// Desk 탭 — 홈페이지 desk.html을 앱 모드로. 30분 넘게 뒤에 있다가 돌아오면 다시 로드(홈페이지 업데이트 반영)
import SwiftUI

struct DeskView: View {
    @Environment(\.scenePhase) private var phase
    @State private var reload = 0
    @State private var left: Date? = nil
    var body: some View {
        BridgeWebView(url: URL(string: "https://nyuheatgis.com/desk.html?app=1")!, reload: reload)
            .ignoresSafeArea(edges: .bottom)
            .onChange(of: phase) { _, p in
                if p == .background { left = Date() }
                else if p == .active, let l = left, Date().timeIntervalSince(l) > 30 * 60 { reload += 1; left = nil }
            }
    }
}
