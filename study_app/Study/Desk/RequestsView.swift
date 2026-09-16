// 제작 요청 — 노트에서 「학습지/슬라이드 만들기 요청」 → desk/requests → Mac 인박스(desk_requests.py) → 세션에서 제작 → 자료실. 상태를 여기서 봄
import SwiftUI

struct MaterialRequest: Identifiable, Equatable {
    var id: String; var type: String; var title: String; var md: String; var status: String; var createdAt: Double; var result: String?; var updatedAt: Double? = nil
    var typeLabel: String { type == "slides" ? "슬라이드" : type == "worksheet" ? "학습지" : type }
    var statusLabel: String { switch status { case "pending": return "요청됨"; case "received": return "Mac 인박스 도착"; case "working": return "제작 중"; case "done": return "완료";case "blocked":return "확인 필요";case "failed":return "실패";case "canceled":return "취소됨"; default: return status } }
    static func parse(_ any: Any?) -> [MaterialRequest] {
        FB.dict(any).compactMap { k, v in guard let d = v as? [String: Any], let t = d["title"] as? String else { return nil }
            return MaterialRequest(id: k, type: d["type"] as? String ?? "worksheet", title: t, md: d["md"] as? String ?? "", status: d["status"] as? String ?? "pending", createdAt: FB.ms(d["createdAt"]), result: d["result"] as? String, updatedAt:d["updatedAt"] as? Double) }.sorted { $0.createdAt > $1.createdAt }
    }
}

struct RequestsView: View {
    @EnvironmentObject var store: DeskStore
    var body: some View {
        List {
            if store.requests.isEmpty { EmptyHint(icon: "doc.badge.gearshape", title: "제작 요청이 없습니다", text: "노트를 열고 메뉴에서 「학습지 만들기 요청」 또는 「슬라이드 만들기 요청」을 누르면 Mac 인박스로 전달되고, 완성본은 자료실에 올라옵니다.") }
            ForEach(store.requests) { r in
                VStack(alignment: .leading, spacing: 4) {
                    HStack { Text(r.typeLabel).desk(.label).padding(.horizontal, 7).padding(.vertical, 2).background(DeskTheme.accent.opacity(0.1), in: Capsule()).foregroundStyle(DeskTheme.accent); Text(r.title).desk(.bodyStrong); Spacer(); Text(r.statusLabel).scaledFont(12, .semibold).foregroundStyle(r.status == "done" ? DeskTheme.success : r.status == "pending" ? .secondary : DeskTheme.warn) }
                    Text(Date(timeIntervalSince1970: r.createdAt / 1000).formatted(date: .abbreviated, time: .shortened)).scaledFont(11).foregroundStyle(.secondary)
                    if let at=r.updatedAt { Text("최근 진행: "+Date(timeIntervalSince1970:at/1000).formatted(date:.abbreviated,time:.shortened)).font(.caption).foregroundStyle(.secondary) }
                    if let res = r.result, !res.isEmpty { Text("결과: " + res).scaledFont(12).foregroundStyle(.secondary);if r.status=="done" { NavigationLink("결과 자료실 열기") { MaterialsView(initialFolder:res.split(separator:"/").first.map(String.init)) } } }
                }
                .swipeActions { Button(role: .destructive) { store.qdelete("desk/requests/\(r.id)") } label: { Label("삭제", systemImage: "trash") } }
            }
        }
        .navigationTitle("제작 요청")
    }
}
