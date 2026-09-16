// Live Activity 화면 — 잠금 화면 배너와 다이내믹 아일랜드
#if !targetEnvironment(macCatalyst)
import WidgetKit
import SwiftUI
import ActivityKit

struct ClassActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ClassActivityAttributes.self) { ctx in
            lockScreen(ctx.state)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ctx.state.mode == "now" ? "지금 수업" : "다음 수업").font(.caption2.weight(.semibold)).foregroundStyle(ctx.state.mode == "now" ? DeskColors.live : DeskColors.accent)
                        Text("\(ctx.state.period)교시").font(.system(size: 26, weight: .bold, design: .rounded))
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(ctx.state.mode == "now" ? "남은 시간" : "시작까지").font(.caption2).foregroundStyle(.secondary)
                        Text(timerInterval: Date()...(ctx.state.mode == "now" ? ctx.state.end : ctx.state.start), countsDown: true).font(.system(size: 22, weight: .semibold, design: .rounded).monospacedDigit()).frame(width: 80, alignment: .trailing)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(ctx.state.subject).font(.headline).lineLimit(1)
                        Spacer()
                        if let n = ctx.state.nextPeriod, let s = ctx.state.nextSubject { Text("다음 \(n)교시 · \(s)").font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                        else if ctx.state.mode == "now" { Text("오늘 마지막").font(.caption).foregroundStyle(.secondary) }
                    }
                }
            } compactLeading: {
                Text("\(ctx.state.period)").font(.system(size: 14, weight: .bold, design: .rounded)).foregroundStyle(ctx.state.mode == "now" ? DeskColors.live : DeskColors.accent)
            } compactTrailing: {
                Text(timerInterval: Date()...(ctx.state.mode == "now" ? ctx.state.end : ctx.state.start), countsDown: true).font(.system(size: 13, weight: .semibold).monospacedDigit()).frame(width: 46)
            } minimal: {
                Text("\(ctx.state.period)").font(.system(size: 13, weight: .bold, design: .rounded)).foregroundStyle(ctx.state.mode == "now" ? DeskColors.live : DeskColors.accent)
            }
        }
    }
    func lockScreen(_ s: ClassActivityAttributes.ContentState) -> some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(s.mode == "now" ? "지금 수업" : "다음 수업").font(.caption.weight(.semibold)).foregroundStyle(s.mode == "now" ? DeskColors.live : DeskColors.accent)
                Text("\(s.period)교시").font(.system(size: 28, weight: .bold, design: .rounded))
                Text(s.subject).font(.subheadline.weight(.semibold)).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(s.mode == "now" ? "남은 시간" : "시작까지").font(.caption2).foregroundStyle(.secondary)
                Text(timerInterval: Date()...(s.mode == "now" ? s.end : s.start), countsDown: true).font(.system(size: 26, weight: .semibold, design: .rounded).monospacedDigit()).frame(width: 96, alignment: .trailing)
                if let n = s.nextPeriod, let sub = s.nextSubject { Text("다음 \(n)교시 · \(sub)").font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
        }
        .padding(16)
        .activityBackgroundTint(Color(.systemBackground).opacity(0.85))
    }
}
#endif
