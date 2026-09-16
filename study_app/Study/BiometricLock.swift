// Face ID 잠금 — 설정이 켜져 있으면 앱이 앞으로 올 때마다 생체 인증. 통과 전엔 흐림 오버레이
import SwiftUI
import LocalAuthentication

@MainActor
final class LockGate: ObservableObject {
    @Published var locked = false
    @Published var failed = false
    func arm() { if TimetableStore.faceIDOn { locked = true; failed = false; Task { await evaluate() } } }
    func evaluate() async {
        let ctx = LAContext(); ctx.localizedCancelTitle = "취소"
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { locked = false; return }   // 생체·암호 모두 불가하면 잠그지 않음
        do { let ok = try await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Desk 열기"); locked = !ok; failed = !ok }
        catch { failed = true }
    }
}

struct LockOverlay: View {
    @ObservedObject var gate: LockGate
    var body: some View {
        if gate.locked {
            ZStack {
                Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
                VStack(spacing: 16) {
                    Image(systemName: "faceid").scaledFont(44).foregroundStyle(.secondary)
                    Text("Desk").font(.title2.bold())
                    if gate.failed { Button("다시 시도") { Task { await gate.evaluate() } }.deskProminent() }
                }
            }
        }
    }
}
