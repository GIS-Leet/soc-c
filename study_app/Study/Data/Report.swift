// 오류·경고 모음 — 조용히 삼키던 실패를 한 곳에 기록하고(최근 100개, 파일), 중요한 것은 화면 위 배너로. 크래시는 MetricKit 진단을 받아 같이 기록
import SwiftUI
import MetricKit

@MainActor
final class Report: ObservableObject {
    static let shared = Report()
    struct Entry: Codable, Identifiable, Equatable { var id: String; var at: Double; var ctx: String; var msg: String; var kind: String   // error | warn | crash
        var date: Date { Date(timeIntervalSince1970: at) } }
    @Published private(set) var entries: [Entry] = Report.load()
    @Published var banner: Entry? = nil
    @Published var needsSignIn = false
    private var hideTask: Task<Void, Never>?
    private static let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("desk-report.json")
    private static func load() -> [Entry] { (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode([Entry].self, from: $0) } ?? [] }
    private func persist() { try? JSONEncoder().encode(entries).write(to: Self.url, options: .atomic) }
    private func add(_ kind: String, _ ctx: String, _ msg: String, show: Bool) {
        let e = Entry(id: UUID().uuidString, at: Date().timeIntervalSince1970, ctx: ctx, msg: String(msg.prefix(300)), kind: kind)
        entries.insert(e, at: 0); if entries.count > 100 { entries.removeLast(entries.count - 100) }; persist()
        if show { banner = e; hideTask?.cancel(); hideTask = Task { try? await Task.sleep(for: .seconds(6)); if !Task.isCancelled { banner = nil } } }
    }
    /// 실패 — 사용자가 결과를 기대한 동작(저장·업로드·전송)은 show: true
    func fail(_ ctx: String, _ error: Error, show: Bool = true) { add("error", ctx, error.localizedDescription, show: show) }
    func fail(_ ctx: String, message: String, show: Bool = true) { add("error", ctx, message, show: show) }
    func warn(_ ctx: String, _ msg: String, show: Bool = false) { add("warn", ctx, msg, show: show) }
    func crash(_ msg: String) { add("crash", "크래시", msg, show: false) }
    func clear() { entries = []; persist() }
    func dismiss() { banner = nil }
    var text: String {
        let f = DateFormatter(); f.dateFormat = "MM-dd HH:mm:ss"
        let info = Bundle.main.infoDictionary ?? [:]
        return "Desk \(info["CFBundleShortVersionString"] ?? "") (\(info["CFBundleVersion"] ?? "")) \(UIDevice.current.model) iOS \(UIDevice.current.systemVersion)\n" + entries.map { "[\(f.string(from: $0.date))] \($0.kind) \($0.ctx): \($0.msg)" }.joined(separator: "\n")
    }
    /// 다른 스레드·actor 에서도 부를 수 있게
    nonisolated static func log(_ ctx: String, _ error: Error, show: Bool = false) { Task { @MainActor in shared.fail(ctx, error, show: show) } }
    nonisolated static func note(_ ctx: String, _ msg: String) { Task { @MainActor in shared.warn(ctx, msg) } }
}

/// MetricKit 크래시·행 진단 수신 — 다음 실행 때 도착. 콜스택 앞부분만 기록
final class Metrics: NSObject, MXMetricManagerSubscriber {
    static let shared = Metrics()
    func start() { MXMetricManager.shared.add(self) }
    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for p in payloads {
            for c in p.crashDiagnostics ?? [] { let s = String(decoding: c.callStackTree.jsonRepresentation(), as: UTF8.self); Task { @MainActor in Report.shared.crash("\(c.exceptionType.map { "type \($0)" } ?? "") \(c.terminationReason ?? "") " + String(s.prefix(400))) } }
            for h in p.hangDiagnostics ?? [] { Task { @MainActor in Report.shared.warn("멈춤", "\(h.hangDuration)") } }
        }
    }
    func didReceive(_ payloads: [MXMetricPayload]) {
        for p in payloads { if let l = p.applicationLaunchMetrics { Task { @MainActor in Report.shared.warn("시작 시간 통계", "\(l.histogrammedTimeToFirstDraw)") } } }
    }
}

/// 화면 맨 위 배너 — 실패 알림, 다시 로그인
struct ReportBanner: View {
    @ObservedObject var r = Report.shared
    @ObservedObject var net = NetworkMonitor.shared
    @ObservedObject var store = DeskStore.shared
    var onSignIn: () -> Void
    var body: some View {
        VStack(spacing: 6) {
            if !net.connected || store.pending > 0 || store.pendingUploads > 0 {
                HStack(spacing: 8) {
                    Image(systemName: net.connected ? "arrow.triangle.2.circlepath" : "wifi.slash").foregroundStyle(.secondary)
                    Text(net.connected ? "보내는 중 · 변경 \(store.pending)개" + (store.pendingUploads > 0 ? " · 파일 \(store.pendingUploads)개" : "") : "오프라인 · 기기에 저장됨" + (store.pending + store.pendingUploads > 0 ? " · 대기 \(store.pending + store.pendingUploads)개" : "")).scaledFont(12, .semibold).foregroundStyle(.secondary)
                    Spacer()
                }.padding(.horizontal, 12).padding(.vertical, 6).background(.thinMaterial, in: Capsule())
                .accessibilityLabel(net.connected ? "변경 전송 중" : "오프라인")
            }
            if r.needsSignIn {
                HStack(spacing: 10) {
                    Image(systemName: "person.crop.circle.badge.exclamationmark").foregroundStyle(DeskTheme.warn)
                    Text("로그인이 풀렸습니다. 데이터가 갱신되지 않아요.").scaledFont(13, .semibold).lineLimit(2)
                    Spacer(); Button("다시 로그인", action: onSignIn).scaledFont(13, .bold).deskProminent().controlSize(.small)
                }.padding(.horizontal, 12).padding(.vertical, 8).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(DeskTheme.warn.opacity(0.4)))
            }
            if let b = r.banner {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(DeskTheme.live)
                    VStack(alignment: .leading, spacing: 1) { Text(b.ctx + " 실패").scaledFont(13, .semibold); Text(b.msg).scaledFont(12).foregroundStyle(.secondary).lineLimit(2) }
                    Spacer(); Button { r.dismiss() } label: { Image(systemName: "xmark").desk(.label) }.buttonStyle(.plain).foregroundStyle(.secondary)
                }.padding(.horizontal, 12).padding(.vertical, 8).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(DeskTheme.live.opacity(0.35)))
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 12).padding(.top, 4)
        .animation(.spring(duration: 0.3), value: r.banner)
        .accessibilityElement(children: .contain)
    }
}
