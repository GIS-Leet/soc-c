// 위젯 화면(뷰) — 오늘 시간표. 중간: 다음 수업 크게 + 오늘 목록, 작음: 다음 수업 하나 + 교시 점.
// 글자는 고정 크기(폰 글자 크기 설정과 무관). iOS 26 「투명」 홈 화면(accented 렌더링)에서는 색 배경을 빼고 유리 위에 단색으로.
import WidgetKit
import SwiftUI

struct Entry: TimelineEntry { let date: Date; let table: Timetable? }

struct DeskWidgetView: View {
    @Environment(\.widgetFamily) var envFamily
    @Environment(\.widgetRenderingMode) var renderingMode
    let entry: Entry
    var family: WidgetFamily? = nil   // 테스트에서 직접 지정
    var fam: WidgetFamily { family ?? envFamily }
    var glass: Bool { renderingMode != .fullColor }   // 투명(유리) 모드
    static let accent = DeskColors.accent   // 앱과 같은 에셋(라이트/다크 값 분리)
    static let live = DeskColors.live
    static let success = DeskColors.success
    var accent: Color { glass ? .primary : Self.accent }
    var live: Color { glass ? .primary : Self.live }
    @Environment(\.colorScheme) var scheme
    /// 반 색 — 앱 시간표와 같은 규칙(교실 번호). 유리 모드에서는 단색
    func classColor(_ subject: String?) -> Color? { glass ? nil : DeskColors.cls(subject: subject, scheme: scheme) }

    var focus: Timetable.Focus? { entry.table?.focus(at: entry.date) }
    var body: some View {
        Group {
            if let t = entry.table, let f = focus {
                if f.shifted { if fam == .systemSmall { smallNext(t, f) } else { mediumNext(t, f) } }
                else if fam == .systemSmall { small(t) } else { medium(t) }
            } else { empty }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
    var weekdayName: String { let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "EEEE"; return f.string(from: entry.date) }
    var empty: some View {
        VStack(alignment: .leading, spacing: 8) {
            eyebrow(weekdayName)
            Text(entry.table == nil ? "앱을 한 번 열면\n시간표를 받아옵니다" : "수업 없음").font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
    }
    func eyebrow(_ s: String, color: Color = .secondary) -> some View {
        Text(s).font(.system(size: 11, weight: .semibold)).foregroundStyle(color).tracking(0.3).widgetAccentable()
    }
    /// 남은/남은 분 표기 — 타임라인 항목 시각 기준(5분 간격 갱신)
    func minsText(_ target: Int) -> String { let d = target - Timetable.minutes(entry.date); return d >= 60 ? "\(d / 60)시간 \(d % 60)분" : "\(max(d, 0))분" }
    func big(_ s: String, size: CGFloat) -> some View { Text(s).font(.system(size: size, weight: .bold, design: .rounded)).lineLimit(1).minimumScaleFactor(0.7).widgetAccentable() }
    func subject(_ s: String, size: CGFloat = 15) -> some View { Text(s).font(.system(size: size, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.75) }
    func meta(_ s: String) -> some View { Text(s).font(.system(size: 12)).foregroundStyle(.secondary).monospacedDigit().lineLimit(1).minimumScaleFactor(0.8) }

    // ── 오늘 수업 끝 → 다음 평일 첫 수업 ──
    func smallNext(_ t: Timetable, _ f: Timetable.Focus) -> some View {
        let slots = t.slots(on: f.date).filter { $0.subject != nil }
        return VStack(alignment: .leading, spacing: 3) {
            eyebrow(Timetable.focusLabel(f, now: entry.date), color: accent)
            if let s = slots.first { big("\(s.period)교시", size: 26); subject(s.subject!); meta("\(Timetable.hhmm(s.period)) · 수업 \(slots.count)개") }
            else { big("수업 없음", size: 20); meta(weekdayName) }
            Spacer(minLength: 0)
            dotsPlain(t, on: f.date)
        }
    }
    func mediumNext(_ t: Timetable, _ f: Timetable.Focus) -> some View {
        let slots = t.slots(on: f.date).filter { $0.subject != nil }
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                eyebrow(Timetable.focusLabel(f, now: entry.date), color: accent)
                if let s = slots.first { big("\(s.period)교시", size: 28); subject(s.subject!); meta("\(Timetable.hhmm(s.period)) 첫 수업") }
                else { big("수업 없음", size: 20); meta("수고했습니다") }
                Spacer(minLength: 0)
            }
            .frame(width: 118, alignment: .leading)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(t.slots(on: f.date), id: \.period) { s in
                    let has = s.subject != nil
                    HStack(spacing: 6) {
                        Text("\(s.period)").font(.system(size: 10, weight: .bold, design: .rounded).monospacedDigit()).frame(width: 14, height: 14)
                            .background(Circle().fill(has ? Color.primary.opacity(0.7) : Color.primary.opacity(0.07)))
                            .foregroundStyle(has ? Color(glass ? .black : .white).opacity(glass ? 0.85 : 1) : Color.primary.opacity(0.45))
                        Text(Timetable.hhmm(s.period)).font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary).frame(width: 32, alignment: .leading)
                        Text(s.subject ?? "—").font(.system(size: 13, weight: has ? .semibold : .regular)).lineLimit(1).minimumScaleFactor(0.75).foregroundStyle(has ? Color.primary : Color.primary.opacity(0.3))
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 5).frame(height: 19)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
    func dotsPlain(_ t: Timetable, on d: Date) -> some View {
        HStack(spacing: 5) {
            ForEach(t.slots(on: d), id: \.period) { s in Circle().fill(Color.primary.opacity(s.subject != nil ? 0.7 : 0.12)).frame(width: 7, height: 7) }
            Spacer()
            Text({ let f = DateFormatter(); f.locale = Locale(identifier: "ko_KR"); f.dateFormat = "EEEE"; return f.string(from: d) }()).font(.system(size: 10)).foregroundStyle(.secondary)
        }
    }
    // ── 작은 위젯: 지금/다음 수업 하나 ──
    func small(_ t: Timetable) -> some View {
        let cur = t.current(at: entry.date), nxt = t.next(at: entry.date)
        return VStack(alignment: .leading, spacing: 3) {
            if let c = cur {
                eyebrow("지금 수업", color: live); big("\(c.period)교시", size: 26); subject(c.subject!); meta("\(minsText(c.start + Timetable.periodLength)) 남음")
            } else if let n = nxt {
                eyebrow("다음 수업", color: accent); big("\(n.period)교시", size: 26); subject(n.subject!); meta("\(Timetable.hhmm(n.period)) · \(minsText(n.start)) 후")
            } else {
                eyebrow(weekdayName); big("오늘 수업 끝", size: 20); meta("수고했습니다")
            }
            Spacer(minLength: 0)
            dots(t, cur: cur, nxt: nxt)
        }
    }
    /// 하단 교시 점: 수업 있는 교시는 진하게, 현재는 빨강, 다음은 파랑, 끝난 건 연하게
    func dots(_ t: Timetable, cur: Timetable.Slot?, nxt: Timetable.Slot?) -> some View {
        let m = Timetable.minutes(entry.date)
        return HStack(spacing: 5) {
            ForEach(t.slots(on: entry.date), id: \.period) { s in
                let has = s.subject != nil, done = s.start + Timetable.periodLength <= m
                Circle().fill(cur?.period == s.period ? live : nxt?.period == s.period ? accent : has ? Color.primary.opacity(done ? 0.25 : 0.7) : Color.primary.opacity(0.12))
                    .frame(width: 7, height: 7)
            }
            Spacer()
            Text(weekdayName).font(.system(size: 10)).foregroundStyle(.secondary)
        }
    }

    // ── 중간 위젯: 왼쪽 다음/지금 수업 크게, 오른쪽 오늘 목록 ──
    func medium(_ t: Timetable) -> some View {
        let cur = t.current(at: entry.date), nxt = t.next(at: entry.date), m = Timetable.minutes(entry.date)
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                if let c = cur {
                    eyebrow("지금 수업", color: live); big("\(c.period)교시", size: 28); subject(c.subject!); meta("\(minsText(c.start + Timetable.periodLength)) 남음")
                    if let n = nxt { Spacer(minLength: 0); meta("다음 \(n.period)교시 \(Timetable.hhmm(n.period))") }
                } else if let n = nxt {
                    eyebrow("다음 수업", color: accent); big("\(n.period)교시", size: 28); subject(n.subject!); meta("\(Timetable.hhmm(n.period)) · \(minsText(n.start)) 후")
                } else {
                    eyebrow(weekdayName); big("오늘 수업 끝", size: 20); meta("수고했습니다")
                }
                Spacer(minLength: 0)
            }
            .frame(width: 118, alignment: .leading)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(t.slots(on: entry.date), id: \.period) { s in
                    let has = s.subject != nil, done = s.start + Timetable.periodLength <= m, isCur = cur?.period == s.period, isNext = nxt?.period == s.period
                    HStack(spacing: 6) {
                        Text("\(s.period)").font(.system(size: 10, weight: .bold, design: .rounded).monospacedDigit())
                            .frame(width: 14, height: 14)
                            .background(Circle().fill(glass ? (isCur ? live : isNext ? accent : has ? Color.primary.opacity(done ? 0.12 : 0.7) : Color.primary.opacity(0.07)) : (classColor(s.subject).map { done ? $0.opacity(0.22) : $0 } ?? Color.primary.opacity(0.07))))
                            .foregroundStyle(isCur || isNext || (has && !done) ? Color(glass ? .black : .white).opacity(glass ? 0.85 : 1) : Color.primary.opacity(0.45))
                            .widgetAccentable(isCur || isNext)
                        Text(Timetable.hhmm(s.period)).font(.system(size: 11).monospacedDigit()).foregroundStyle(.secondary).frame(width: 32, alignment: .leading)
                        Text(s.subject ?? "—").font(.system(size: 13, weight: has ? .semibold : .regular)).lineLimit(1).minimumScaleFactor(0.75)
                            .foregroundStyle(has ? (done ? Color.secondary : Color.primary) : Color.primary.opacity(0.3))
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 5).frame(height: 19)
                    .background(RoundedRectangle(cornerRadius: 5).fill(glass ? Color.primary.opacity(isCur || isNext ? 0.12 : 0) : isCur ? Self.live.opacity(0.12) : isNext ? Self.accent.opacity(0.10) : Color.clear))
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}
