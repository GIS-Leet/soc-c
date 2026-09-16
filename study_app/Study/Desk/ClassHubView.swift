// 「수업」 탭 — 반(진도)·학생 질문·좌석표와 상담·자료·주간 리뷰·제작 요청. 무대의 버튼이 여기로 들어온다
import SwiftUI

struct ClassHubView: View {
    @EnvironmentObject var store: DeskStore
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink { QAListView() } label: {
                        HStack { Label("학생 질문", systemImage: "bubble.left.and.bubble.right"); Spacer()
                            if store.unanswered > 0 { Text("\(store.unanswered)").desk(.label).foregroundStyle(.white).padding(.horizontal, 7).padding(.vertical, 2).background(DeskTheme.live, in: Capsule()) }
                            else { Text("\(store.questions.count)").foregroundStyle(.secondary) } }
                    }
                    NavigationLink { ClassView() } label: { Label("학생 · 좌석표 · 상담", systemImage: "person.text.rectangle") }
                    NavigationLink { RosterView() } label: { Label("홈페이지 명단", systemImage: "checkmark.seal") }
                    NavigationLink { MaterialsView() } label: { Label("자료함", systemImage: "folder") }
                    NavigationLink { LectureVideosView() } label: { Label("강의 영상", systemImage: "play.rectangle") }
                }
                Section {
                    if store.progress.classes.isEmpty { Text("진도표가 없습니다 — PC desk 에서 차시와 반을 만들면 여기에 나옵니다").font(.footnote).foregroundStyle(.secondary) }
                    ForEach(store.progress.classes) { c in classRow(c) }
                } header: {
                    HStack { Text("반별 진도"); Spacer(); if let l = store.progress.examLabel, let d = store.progress.examDate { Text("\(l) " + DDay(id: "", label: l, date: d).badge) } }
                } footer: {
                    let heat = store.questionHeat()
                    if !heat.isEmpty { Text("최근 30일 질문 몰림: " + heat.prefix(3).map { "\($0.unit.prefix(10)) \($0.n)" }.joined(separator: " · ")) }
                }
                Section("이번 주") {
                    NavigationLink { TeacherReviewView() } label: { Label("주간 리뷰", systemImage: "calendar.badge.clock") }
                    NavigationLink { RequestsView() } label: { Label("제작 요청", systemImage: "doc.badge.gearshape") }
                }
            }
            .navigationTitle("수업")
        }
    }
    func classRow(_ c: ProgressClass) -> some View {
        let total = store.progress.lessons.count, done = max(0, min(total, c.done)), pct = total > 0 ? CGFloat(done) / CGFloat(total) : 0
        let color = DeskColors.cls(name: c.name, scheme: scheme) ?? DeskTheme.accent
        return HStack(spacing: 10) {
            HStack(spacing: 6) { ClassDot(name: c.name, size: 9); Text(c.name).desk(.bodyStrong) }.frame(width: 60, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(Color.primary.opacity(0.08)); Capsule().fill(color).frame(width: g.size.width * pct) } }.frame(height: 6)
                Text(store.progress.next(for: c).map { "다음: \($0.title)" } ?? "진도 완료").font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Text("\(done)/\(total)").scaledFont(12, mono: true).foregroundStyle(.secondary)
            HStack(spacing: 0) {
                Button { store.step(c, -1) } label: { Image(systemName: "minus").frame(width: 28, height: 28) }.buttonStyle(.bordered).disabled(done == 0)
                Button { Haptic.light(); store.step(c, 1) } label: { Image(systemName: "plus").frame(width: 28, height: 28) }.buttonStyle(.borderedProminent).disabled(done >= total)
            }.desk(.label).controlSize(.mini).buttonStyle(.plain)
        }
        .padding(.vertical, 2)
    }
}
