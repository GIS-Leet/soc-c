// 홈페이지 명단 — 학번·이름 목록을 붙여 넣어 해시로 게시(roster), 어느 학생이 lecture.html 인증을 마쳤는지(members) 표시. 명단에서 지우면 그 학생은 즉시 차단
import SwiftUI

struct RosterView: View {
    @EnvironmentObject var store: DeskStore
    @State private var pasting = false
    @State private var search = ""
    var filtered: [RosterEntry] { entries.filter { ListSearch.matches(search,fields:[$0.sid,$0.name]) } }
    var entries: [RosterEntry] { store.roster.values.sorted { $0.sid < $1.sid } }
    var body: some View {
        let verified = entries.filter { store.isVerified($0.h) }.count
        List {
            Section {
                Text("홈페이지 「강의 영상」은 여기 올린 학번·이름과 맞아야 열립니다. 학번·이름과 접근 확인용 해시를 교사 전용 명단으로 저장합니다. 학생에게 전체 명단은 공개하지 않습니다.").font(.footnote).foregroundStyle(.secondary)
                Button { pasting = true } label: { Label(entries.isEmpty ? "명단 붙여넣기" : "명단 다시 붙여넣기", systemImage: "doc.on.clipboard") }
            }
            if entries.isEmpty { EmptyHint(icon: "person.text.rectangle", title: "명단이 없습니다", text: "한 줄에 「학번 이름」 형식으로 붙여 넣으면 됩니다. 예) 20315 홍길동") }
            Section {
                ForEach(filtered) { e in
                    HStack(spacing: 10) {
                        Text(e.sid).scaledFont(13, mono: true).foregroundStyle(.secondary).frame(width: 56, alignment: .leading)
                        Text(e.name).desk(.body)
                        Spacer()
                        if let m = store.members.first(where: { $0.h == e.h }) {
                            Image(systemName: "checkmark.seal.fill").foregroundStyle(DeskTheme.success)
                            Text(Date(timeIntervalSince1970: m.at / 1000).formatted(.dateTime.month().day())).font(.caption2).foregroundStyle(.tertiary)
                        } else { Image(systemName: "seal").foregroundStyle(.quaternary) }
                    }
                    .swipeActions(edge: .trailing) { Button(role: .destructive) { store.removeRosterEntry(e.h) } label: { Label("차단", systemImage: "person.slash") } }
                }
            } header: { if !entries.isEmpty { Text("인증 \(verified) / \(entries.count)") } }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("홈페이지 명단")
        .searchable(text:$search,prompt:"학번·이름")
        .sheet(isPresented: $pasting) { RosterPasteSheet(existing: entries) { store.publishRoster($0) } }
    }
}

struct RosterPasteSheet: View {
    let existing: [RosterEntry]
    let onPublish: ([RosterLine.Entry]) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""; @State private var confirm = false
    var changes: RosterChange { RosterChange(existing:existing,text:text) }
    var parsed: [RosterLine.Entry] { RosterLine.parse(text) }
    var body: some View {
        NavigationStack {
            Form {
                Section { TextEditor(text: $text).frame(minHeight: 220).scaledFont(15, mono: true) } header: { Text("한 줄에 학번 이름") } footer: { Text(text.isEmpty ? "예) 20315 홍길동" : "\(parsed.count)명 인식") }
                if !text.isEmpty {
                    Section("바뀌는 명단") {
                        Text("추가 \(changes.added.count)명 · 유지 \(changes.kept.count)명 · 제외 \(changes.removed.count)명")
                        if !changes.removed.isEmpty { Text("제외되는 학생: "+changes.removed.map { $0.sid+" "+$0.name }.joined(separator:", ")).foregroundStyle(DeskTheme.warn) }
                        if !changes.invalidLines.isEmpty { Text("인식하지 못한 줄: "+changes.invalidLines.map(String.init).joined(separator:", ")).foregroundStyle(DeskTheme.live) }
                        if !changes.duplicateIDs.isEmpty { Text("중복 학번: "+changes.duplicateIDs.joined(separator:", ")).foregroundStyle(DeskTheme.live) }
                    }
                }
                if !parsed.isEmpty { Section("미리 보기") { ForEach(parsed.prefix(5), id: \.sid) { Text("\($0.sid)  \($0.name)").scaledFont(14, mono: true) }; if parsed.count > 5 { Text("… 외 \(parsed.count - 5)명").foregroundStyle(.secondary) } } }
            }
            .navigationTitle("명단 붙여넣기").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("게시") { if !existing.isEmpty { confirm = true } else { onPublish(parsed); dismiss() } }.disabled(parsed.isEmpty || !changes.invalidLines.isEmpty || !changes.duplicateIDs.isEmpty) }
            }
            .confirmationDialog("기존 \(existing.count)명을 이 \(parsed.count)명으로 바꿉니다.", isPresented: $confirm, titleVisibility: .visible) { Button("바꾸기", role: .destructive) { onPublish(parsed); dismiss() } }
        }
    }
}
