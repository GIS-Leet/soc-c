// 필기 성능 기록 — 페이지 전환·획 반영·저장 시간을 재서 설정 화면에서 볼 수 있게(실기기 병목 확인용). os_signpost 로 Instruments 에서도 보임
import Foundation
import os.signpost

enum InkPerf {
    struct Sample: Codable { var label: String; var ms: Double; var at: Double }
    static let log = OSLog(subsystem: "nyuheatgis", category: "ink")
    private static var starts: [String: CFAbsoluteTime] = [:]
    static let key = "ink.perf"
    static var defaults: UserDefaults { TestRuntime.isTesting ? TimetableStore.testDefaults : .standard }
    static func begin(_ label: String) { starts[label] = CFAbsoluteTimeGetCurrent(); os_signpost(.begin, log: log, name: "ink", "%{public}s", label) }
    static func end(_ label: String) { guard let s = starts.removeValue(forKey: label) else { return }; record(label, (CFAbsoluteTimeGetCurrent() - s) * 1000); os_signpost(.end, log: log, name: "ink", "%{public}s", label) }
    static func measure<T>(_ label: String, _ body: () throws -> T) rethrows -> T { let s = CFAbsoluteTimeGetCurrent(); defer { record(label, (CFAbsoluteTimeGetCurrent() - s) * 1000) }; return try body() }
    static func record(_ label: String, _ ms: Double) {
        var all = samples(); all.append(Sample(label: label, ms: ms, at: Date().timeIntervalSince1970)); if all.count > 300 { all.removeFirst(all.count - 300) }
        defaults.set(try? JSONEncoder().encode(all), forKey: key)
    }
    static func samples() -> [Sample] { defaults.data(forKey: key).flatMap { try? JSONDecoder().decode([Sample].self, from: $0) } ?? [] }
    static func clear() { defaults.removeObject(forKey: key) }
    /// 라벨별 평균·최대·횟수
    static func summary() -> [(label: String, avg: Double, max: Double, n: Int, p50: Double, p95: Double)] {
        var out: [(label: String, avg: Double, max: Double, n: Int, p50: Double, p95: Double)] = []
        for (k, v) in Dictionary(grouping: samples(), by: \.label) {
            let ms = v.map(\.ms); let sum = ms.reduce(0, +)
            out.append((k, sum / Double(max(1, ms.count)), ms.max() ?? 0, ms.count, percentile(ms,0.5), percentile(ms,0.95)))
        }
        return out.sorted { $0.avg > $1.avg }
    }
    static func percentile(_ values:[Double],_ fraction:Double)->Double { guard !values.isEmpty else {return 0};let sorted=values.sorted();return sorted[max(0,min(sorted.count-1,Int(ceil(Double(sorted.count)*fraction))-1))] }
    static let names = ["page": "페이지 전환", "stroke": "획 반영", "flush": "저장", "grid": "격자 열기", "bg": "배경 렌더", "launch": "앱 시작"]
    /// 목표치(ms) — 넘으면 설정에서 주황색
    static let target: [String: Double] = ["page": 150, "stroke": 30, "flush": 200, "grid": 300, "bg": 200, "launch": 1000]
}
