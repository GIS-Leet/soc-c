// 발성 연습 화면 — 7단계 타이머. 건너뛰기 없음, 단계가 끝나면 진동과 함께 다음으로. 마지막까지 끝내야 완료
import SwiftUI

struct VocalPracticeView: View {
    let onDone: () -> Void
    @State private var index = 0
    @State private var left = VocalRoutine.steps[0].seconds
    @State private var running = false
    @State private var finished = false
    @Environment(\.colorScheme) private var scheme
    let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    var step: VocalRoutine.Step { VocalRoutine.steps[min(index, VocalRoutine.steps.count - 1)] }
    var progress: Double { Double(step.seconds - left) / Double(step.seconds) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                ForEach(Array(VocalRoutine.steps.enumerated()), id: \.offset) { i, _ in
                    Capsule().fill(i < index || finished ? DeskTheme.success : i == index ? DeskTheme.accent : Color.primary.opacity(0.12)).frame(height: 4)
                }
            }
            .padding(.horizontal, 24).padding(.top, 60)
            Spacer()
            if finished {
                VStack(spacing: 14) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 64)).foregroundStyle(DeskTheme.success)
                    Text("오늘 발성 끝").desk(.heading)
                    Text("\(VocalRoutine.totalMinutes)분 · 잔디에 기록됩니다").desk(.body).foregroundStyle(.secondary)
                    Button { Haptic.success(); onDone() } label: { Text("완료").frame(maxWidth: .infinity) }.deskProminent().controlSize(.large).padding(.top, 8)
                }
                .padding(.horizontal, 32)
            } else {
                VStack(spacing: 18) {
                    Text("\(index + 1) / \(VocalRoutine.steps.count) · 발성 연습").desk(.label).foregroundStyle(DeskTheme.accent)
                    Text(step.title).scaledFont(36, .bold)
                    ZStack {
                        Circle().stroke(Color.primary.opacity(0.08), lineWidth: 10)
                        Circle().trim(from: 0, to: progress).stroke(DeskTheme.accent, style: StrokeStyle(lineWidth: 10, lineCap: .round)).rotationEffect(.degrees(-90)).animation(.linear(duration: 1), value: progress)
                        Text(String(format: "%d:%02d", left / 60, left % 60)).desk(.number(44))
                    }
                    .frame(width: 180, height: 180).padding(.vertical, 8)
                    Text(step.guide).scaledFont(17).lineSpacing(5).multilineTextAlignment(.center).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    if !running {
                        Button { running = true; Haptic.light() } label: { Label(index == 0 ? "시작" : "계속", systemImage: "play.fill").frame(maxWidth: .infinity) }.deskProminent().controlSize(.large).padding(.top, 8)
                    } else {
                        Button { running = false } label: { Label("잠깐 멈춤", systemImage: "pause.fill") }.buttonStyle(.bordered).padding(.top, 8)
                    }
                }
                .padding(.horizontal, 32)
            }
            Spacer()
            Text(finished ? "" : "중간에 닫으면 처음부터 다시 합니다").desk(.small).foregroundStyle(.tertiary).padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DeskTheme.canvas)
        .onReceive(tick) { _ in
            guard running, !finished else { return }
            if left > 1 { left -= 1; return }
            Haptic.success()
            if index + 1 < VocalRoutine.steps.count { index += 1; left = VocalRoutine.steps[index].seconds } else { finished = true; running = false }
        }
    }
}
