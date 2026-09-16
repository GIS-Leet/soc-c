// 오늘 화면의 띠와 무대 — 교시 띠(반 색 칩)와 국면별 무대(수업 중·쉬는 시간·공강·아침·방과 후·주말). 읽지 않고 쓰게: 지금 필요한 버튼이 가장 크다
import SwiftUI

/// 교시 띠 — 1~7 칩. 수업 있는 교시는 반 색, 지금은 진하게, 지난 건 흐리게. 누르면 그 수업 미리보기(다시 누르면 해제)
struct PeriodStrip: View {
    let now: Date; let table: Timetable?
    @Binding var selected: Int?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let f = table?.focus(at: now) ?? Timetable.Focus(date: now, shifted: false)
        let slots = table?.slots(on: f.date) ?? (1...7).map { Timetable.Slot(period: $0, start: Timetable.periodStart[$0] ?? 0, subject: nil) }
        let m = f.shifted ? -1 : Timetable.minutes(now), cur = f.shifted ? nil : table?.current(at: now)
        let layout=typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:6)) : AnyLayout(HStackLayout(spacing:6))
        layout {
            ForEach(slots, id: \.period) { s in
                let has = s.subject != nil, done = m >= 0 && s.start + Timetable.periodLength <= m, isCur = cur?.period == s.period, on = selected == s.period
                let color = DeskColors.cls(subject: s.subject, scheme: scheme) ?? Color.primary.opacity(0.12)
                Button {
                    Haptic.selection(); selected = on ? nil : s.period
                } label: {
                    VStack(spacing: 3) {
                        Text("\(s.period)").scaledFont(15, .bold, design: .rounded, mono: true)
                        Text(has ? LessonPrep.room(of: s.subject!) : "·").scaledFont(10, .semibold, mono: true).opacity(has ? 0.9 : 0.4)
                    }
                    .frame(maxWidth: .infinity).frame(minHeight: 44)
                    .foregroundStyle(has ? (done && !on ? color : DeskColors.readableInk(on:color,scheme:scheme)) : Color.primary.opacity(0.35))
                    .background(has ? (done && !on ? color.opacity(0.14) : color) : Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(on ? Color.primary : isCur ? Color.white.opacity(0.9) : .clear, lineWidth: on ? 2 : 1.5))
                    .scaleEffect(isCur ? 1.06 : 1)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(s.period)교시 " + (s.subject ?? "수업 없음") + (isCur ? " 지금" : ""))
            }
        }
        .accessibilityElement(children: .contain).accessibilityLabel(f.shifted ? Timetable.focusLabel(f, now: now) + " 교시 띠" : "오늘 교시 띠")
    }
}

/// 한 수업의 준비 정보 — 교실·반·다음 차시·맞는 자료 (무대와 미리보기가 같이 씀)
struct SlotPrep {
    let slot: Timetable.Slot; let room: String; let className: String?; let cls: ProgressClass?; let lesson: Lesson?; let files: [GHFile]; let date: Date
    var context: LessonContext { LessonContext(classID: cls?.id, className: cls?.name ?? room, room: room, lessonNo: lesson?.order, lessonTitle: lesson?.title, date: date, period: slot.period) }
    static func make(_ slot: Timetable.Slot, date: Date, progress: Progress, files: [GHFile]) -> SlotPrep? {
        guard let subject = slot.subject else { return nil }
        let room = LessonPrep.room(of: subject)
        let cls = LessonPrep.progressClass(for: room, in: progress.classes)
        let lesson = cls.flatMap { progress.next(for: $0) }
        let name = cls?.name ?? LessonPrep.classNumber(room: room).map { "\($0)반" }
        return SlotPrep(slot: slot, room: room, className: name, cls: cls, lesson: lesson, files: LessonPrep.match(lesson: lesson, files: files), date: date)
    }
    /// "통사2C" — 교실 뒤의 과목 표기
    var subjectName: String { slot.subject.map { s in s.split(separator: " ").dropFirst().joined(separator: " ") }.flatMap { $0.isEmpty ? nil : $0 } ?? slot.subject ?? "" }
}

extension TodayView {
    // ── 무대 ──
    @ViewBuilder func stage(phase: DayPhase, now: Date) -> some View {
        let t = TimetableStore.timetable, f = focus(now)
        if let p = selectedPeriod, let s = t?.slots(on: f.date).first(where: { $0.period == p }), let prep = SlotPrep.make(s, date: f.date, progress: store.progress, files: prepFiles) {
            previewStage(prep, now: now, focus: f)
        } else {
            switch phase {
            case .inClass(let s, let left, let next): inClassStage(s, left: left, next: next, now: now)
            case .breakTime(let n, let gap), .free(let n, let gap): gapStage(n, gap: gap, phase: phase, now: now)
            case .morning(let first): morningStage(first, now: now)
            case .after(let last): afterStage(last, now: now)
            case .weekend, .noClasses: restStage(phase, now: now)
            }
        }
    }
    func prep(_ s: Timetable.Slot, date: Date) -> SlotPrep? { SlotPrep.make(s, date: date, progress: store.progress, files: prepFiles) }
    func mins(_ m: Int) -> String { m >= 60 ? (m % 60 == 0 ? "\(m / 60)시간" : "\(m / 60)시간 \(m % 60)분") : "\(m)분" }
    func classColor(_ s: Timetable.Slot?) -> Color { DeskColors.cls(subject: s?.subject, scheme: scheme) ?? DeskTheme.accent }

    /// 수업 중 — 반 색을 가득 채운 면. 남은 시간, 이 차시, 필기·학생 버튼
    func inClassStage(_ s: Timetable.Slot, left: Int, next: Timetable.Slot?, now: Date) -> some View {
        let p = prep(s, date: now), color = classColor(s), total = Timetable.periodLength
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(s.period)교시 · \(p?.room ?? "") · \(p?.subjectName ?? "")").desk(.label).tracking(0.6).opacity(0.85)
                Spacer()
                Text("\(left)분 남음").desk(.number(15)).opacity(left <= 5 ? 1 : 0.85)
            }
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text(p?.className ?? (s.subject ?? "")).desk(.number(46))
                if let l = p?.lesson { Text("\(l.order)차시").desk(.heading).opacity(0.85) }
            }
            if let l = p?.lesson { Text(l.title).desk(.bodyStrong).lineLimit(2).opacity(0.95) }
            else if let c = p?.cls { Text("\(c.name) 진도 완료").desk(.body).opacity(0.85) }
            GeometryReader { g in ZStack(alignment: .leading) { Capsule().fill(.white.opacity(0.25)); Capsule().fill(.white).frame(width: g.size.width * CGFloat(min(1, max(0, Double(total - left) / Double(total))))) } }.frame(height: 5)
            HStack(spacing: 8) {
                prepButton(p, filled: true)
                NavigationLink { ClassView(initialClassName:p?.className) } label: { stageButtonLabel("학생 · 좌석표", icon: "person.2", filled: true) }.buttonStyle(.plain)
            }
            .padding(.top, 2)
            if let n = next { Text("다음 \(n.period)교시 \(Timetable.hhmm(n.period)) · \(prep(n, date: now)?.className ?? n.subject!)").desk(.small).opacity(0.8) }
            else { Text("오늘 마지막 수업").desk(.small).opacity(0.8) }
        }
        .foregroundStyle(DeskColors.readableInk(on:color,scheme:scheme))
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(color, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .contain).accessibilityLabel("수업 중 \(s.period)교시 \(p?.className ?? "") \(left)분 남음")
    }

    /// 쉬는 시간·공강 — 다음 수업까지, 준비 상태, 공부 한 장, 답할 질문
    func gapStage(_ n: Timetable.Slot, gap: Int, phase: DayPhase, now: Date) -> some View {
        let p = prep(n, date: now)
        return DeskCard(tint: classColor(n)) {
            Eyebrow(text: "\(phase.label) · 다음 \(n.period)교시 \(Timetable.hhmm(n.period))", trailing: p?.room)
            HStack(alignment: .lastTextBaseline, spacing: 8) { Text(mins(gap)).desk(.number(40)).foregroundStyle(DeskTheme.brand); Text("후").desk(.heading).foregroundStyle(.secondary) }
            HStack(spacing: 6) { ClassDot(name: p?.className, size: 8); Text([p?.className, p?.lesson.map { "\($0.order)차시 · \($0.title)" } ?? p?.subjectName].compactMap { $0 }.joined(separator: " · ")).desk(.bodyStrong).lineLimit(1) }
            HStack(spacing: 8) { prepButton(p, filled: false) }
            Divider().padding(.vertical, 2)
            studyRow(compact: phase.label == "쉬는 시간")
            vocalRow
            questionsRow
        }
    }

    /// 아침 — 오늘 개요와 첫 수업 준비
    func morningStage(_ first: Timetable.Slot, now: Date) -> some View {
        let p = prep(first, date: now), t = TimetableStore.timetable, count = t?.slots(on: now).filter { $0.subject != nil }.count ?? 0
        return DeskCard(tint: classColor(first)) {
            Eyebrow(text: "\(weekday(now)) · 수업 \(count)개", trailing: DayPhase.morning(first: first).label)
            HStack(alignment: .lastTextBaseline, spacing: 8) { Text(Timetable.hhmm(first.period)).desk(.number(40)).foregroundStyle(DeskTheme.brand); Text("첫 수업").desk(.heading).foregroundStyle(.secondary) }
            HStack(spacing: 6) { ClassDot(name: p?.className, size: 8); Text([p?.className, p?.lesson.map { "\($0.order)차시 · \($0.title)" } ?? p?.subjectName].compactMap { $0 }.joined(separator: " · ")).desk(.bodyStrong).lineLimit(1) }
            HStack(spacing: 8) { prepButton(p, filled: false) }
            Divider().padding(.vertical, 2)
            summaryRow(now: now)
            questionsRow
        }
    }

    /// 방과 후 — 정리: 오늘 수업한 반 진도, 질문, 내일 첫 수업, 주간 리뷰
    func afterStage(_ last: Timetable.Slot, now: Date) -> some View {
        let t = TimetableStore.timetable, todays = t?.slots(on: now).filter { $0.subject != nil } ?? []
        let classes = todays.compactMap { prep($0, date: now)?.cls }.reduce(into: [ProgressClass]()) { acc, c in if !acc.contains(where: { $0.id == c.id }) { acc.append(c) } }
        let f = focus(now), tomorrowFirst = f.shifted ? t?.slots(on: f.date).first { $0.subject != nil } : nil
        return DeskCard {
            Eyebrow(text: "오늘 수업 끝", trailing: "수고했습니다")
            Text("정리").desk(.number(34)).foregroundStyle(DeskTheme.brand)
            if !classes.isEmpty {
                let total = store.progress.lessons.count
                ForEach(classes) { c in
                    HStack(spacing: 8) {
                        ClassDot(name: c.name, size: 8); Text(c.name).desk(.bodyStrong)
                        Text(store.progress.next(for: c).map { "다음 \($0.order)차시" } ?? "진도 완료").desk(.small).foregroundStyle(.secondary).lineLimit(1)
                        Spacer()
                        Text("\(min(total, c.done))/\(total)").scaledFont(12, mono: true).foregroundStyle(.secondary)
                        Button { Haptic.light(); store.step(c, 1) } label: { Label("한 차시", systemImage: "plus").font(.caption.weight(.semibold)) }.buttonStyle(.bordered).controlSize(.mini).disabled(c.done >= total)
                    }
                }
            }
            questionsRow
            if let n = tomorrowFirst { HStack(spacing: 6) { Image(systemName: "sunrise").foregroundStyle(.secondary); Text("\(Timetable.focusLabel(f, now: now)) 첫 수업 \(Timetable.hhmm(n.period)) · \(prep(n, date: f.date)?.className ?? n.subject!)").desk(.small).foregroundStyle(.secondary) } }
            NavigationLink { TeacherReviewView() } label: { HStack { Image(systemName: "calendar.badge.clock"); Text("이번 주 리뷰") }.desk(.body).foregroundStyle(DeskTheme.accent) }.buttonStyle(.plain)
        }
    }

    /// 주말·수업 없는 날 — 공부와 다음 첫 수업
    func restStage(_ phase: DayPhase, now: Date) -> some View {
        let t = TimetableStore.timetable, f = focus(now), nextFirst = f.shifted ? t?.slots(on: f.date).first { $0.subject != nil } : nil
        return DeskCard {
            Eyebrow(text: phase.label, trailing: weekday(now))
            HStack(alignment: .lastTextBaseline, spacing: 6) { Text("\(store.streak)").desk(.number(40)).foregroundStyle(DeskTheme.brand); Text("일 연속 공부").desk(.heading).foregroundStyle(.secondary) }
            studyRow(compact: false)
            vocalRow
            if let n = nextFirst { HStack(spacing: 6) { Image(systemName: "sunrise").foregroundStyle(.secondary); Text("\(Timetable.focusLabel(f, now: now)) 첫 수업 \(Timetable.hhmm(n.period)) · \(prep(n, date: f.date)?.className ?? n.subject!)").desk(.small).foregroundStyle(.secondary) } }
            questionsRow
        }
    }

    /// 띠에서 고른 교시 미리보기
    func previewStage(_ p: SlotPrep, now: Date, focus f: Timetable.Focus) -> some View {
        DeskCard(tint: classColor(p.slot)) {
            Eyebrow(text: "\(f.shifted ? Timetable.focusLabel(f, now: now) + " " : "")\(p.slot.period)교시 · \(Timetable.hhmm(p.slot.period)) · \(p.room)", trailing: "미리보기")
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                Text(p.className ?? p.slot.subject ?? "").desk(.number(40)).foregroundStyle(DeskTheme.brand)
                Text(p.subjectName).desk(.heading).foregroundStyle(.secondary)
            }
            if let l = p.lesson { Text("\(l.order)차시 · \(l.title)").desk(.bodyStrong).lineLimit(2); if !l.unit.isEmpty { Text(l.unit).desk(.small).foregroundStyle(.secondary) } }
            else if let c = p.cls { Text("\(c.name) 진도 완료").desk(.body).foregroundStyle(.secondary) }
            else { Text("진도표에 없는 반").desk(.body).foregroundStyle(.secondary) }
            HStack(spacing: 8) { prepButton(p, filled: false) }
            Button { selectedPeriod = nil } label: { HStack { Image(systemName: "xmark.circle.fill"); Text("닫기") }.desk(.small).foregroundStyle(.secondary) }.buttonStyle(.plain).padding(.top, 2)
        }
    }

    // ── 무대 부품 ──
    /// 자료 버튼 — 맞는 자료가 있으면 「필기」로 바로 열고, 없으면 자료함
    @ViewBuilder func prepButton(_ p: SlotPrep?, filled: Bool) -> some View {
        if let p, let f = p.files.first {
            Button { Task { await openPrep(f, ctx: p.context) } } label: {
                if prepBusy == f.id { stageButtonLabel("여는 중…", icon: "pencil.tip", filled: filled) } else { stageButtonLabel(f.name.count > 14 ? "학습지 필기" : f.name, icon: "pencil.tip", filled: filled) }
            }.buttonStyle(.plain)
            if p.files.count > 1 { Menu { ForEach(p.files) { file in Button(file.name) { Task { await openPrep(file,ctx:p.context) } } } } label: { Text("+\(p.files.count - 1)").desk(.small).frame(minWidth:44,minHeight:44) }.accessibilityLabel("추천 자료 모두 보기") }
        } else {
            NavigationLink { MaterialsView() } label: { stageButtonLabel(store.github == nil ? "자료함" : "맞는 자료 없음 · 자료함", icon: "folder", filled: filled) }.buttonStyle(.plain)
        }
    }
    func stageButtonLabel(_ text: String, icon: String, filled: Bool) -> some View {
        HStack(spacing: 6) { Image(systemName: icon).scaledFont(13, .semibold); Text(text).scaledFont(14, .semibold).lineLimit(1) }
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(filled ? AnyShapeStyle(.white.opacity(0.22)) : AnyShapeStyle(DeskTheme.accent.opacity(scheme == .dark ? 0.22 : 0.12)), in: Capsule())
            .foregroundStyle(filled ? (scheme == .dark ? Color.black : Color.white) : DeskTheme.accent)
    }
    /// 오늘 안 한 공부 한 줄 + 지금 공부
    @ViewBuilder func studyRow(compact: Bool) -> some View {
        let g = store.dailyGoal()
        let todo: [(String, Bool)] = [("지리", g.geo), ("일본어", g.jp)] + (g.hasEn ? [("영어", g.en)] : [])
        let left = todo.filter { !$0.1 }.map(\.0)
        HStack(spacing: 8) {
            Image(systemName: left.isEmpty ? "checkmark.circle.fill" : "book").foregroundStyle(left.isEmpty ? DeskTheme.success : DeskTheme.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text(left.isEmpty ? "오늘 공부 끝 · \(store.streak)일 연속" : "공부 남음 · " + left.joined(separator: " · ")).desk(.bodyStrong).lineLimit(1)
                if !compact, let c = store.dailyCards.first(where: { left.contains($0.subject) }) { Text("\(c.subject) · \(c.title)").desk(.small).foregroundStyle(.secondary).lineLimit(1) }
            }
            Spacer()
            if !left.isEmpty { Button { m.openStudy() } label: { Label("지금 공부", systemImage: "play.fill").font(.caption.weight(.semibold)) }.deskProminent().controlSize(.small) }
        }
    }
    /// 발성 연습(iPhone, 21:00 뒤 안 했으면) — 끝낼 때까지 남는다
    @ViewBuilder var vocalRow: some View {
        if m.vocalPending {
            HStack(spacing: 8) {
                Image(systemName: "waveform").foregroundStyle(DeskTheme.live)
                VStack(alignment: .leading, spacing: 1) {
                    Text("발성 연습 밀림").desk(.bodyStrong)
                    Text("\(VocalRoutine.totalMinutes)분 · 끝내야 잠금이 풀려요").desk(.small).foregroundStyle(.secondary)
                }
                Spacer()
                Button { m.openVocal() } label: { Label("지금 시작", systemImage: "play.fill").font(.caption.weight(.semibold)) }.deskProminent().controlSize(.small)
            }
        }
    }
    @ViewBuilder var questionsRow: some View {
        if store.unanswered > 0 {
            NavigationLink { QAListView() } label: {
                HStack(spacing: 8) {
                    Image(systemName: "bubble.left.and.bubble.right").foregroundStyle(DeskTheme.live)
                    Text("학생 질문 \(store.unanswered)개 답하기").desk(.bodyStrong)
                    Spacer(); Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                }.contentShape(Rectangle())
            }.buttonStyle(.plain)
        }
    }
    /// 아침 요약 — 일정·할 일·공지 개수
    func summaryRow(now: Date) -> some View {
        let ev = store.events(on: now).count + (cal.external[FB.key(now)] ?? []).count, todos = store.todos.filter { !$0.done }.count
        let parts = [ev > 0 ? "일정 \(ev)" : nil, todos > 0 ? "할 일 \(todos)" : nil, store.notices.isEmpty ? nil : "공지 \(store.notices.count)"].compactMap { $0 }
        return HStack(spacing: 8) {
            Image(systemName: "list.bullet").foregroundStyle(.secondary)
            Text(parts.isEmpty ? "오늘 일정·할 일 없음" : parts.joined(separator: " · ")).desk(.body).foregroundStyle(.secondary)
            Spacer()
        }
    }
}
