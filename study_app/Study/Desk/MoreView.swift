// 「더보기」 — 홈페이지 공지·Desk 웹·설정. 수업 관련(반·질문·좌석표·자료·리뷰)은 「수업」 탭
import SwiftUI

struct MoreView: View {
    @EnvironmentObject var m: AppModel
    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink { NoticeListView() } label: { Label("홈페이지 공지", systemImage: "megaphone") }
                }
                Section("PC 화면 그대로") {
                    NavigationLink { DeskView().navigationTitle("Desk 웹").navigationBarTitleDisplayMode(.inline) } label: { Label("Desk 웹 열기", systemImage: "rectangle.grid.2x2") }
                }
                Section { NavigationLink { SettingsView() } label: { Label("설정", systemImage: "gearshape") } }
                Section { HStack { Text("Desk"); Spacer(); Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "").foregroundStyle(.secondary) } }
            }
            .navigationTitle("더보기")
        }
    }
}
