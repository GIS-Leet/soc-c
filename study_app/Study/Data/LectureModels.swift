// 강의 영상 모델 — videos(영상)·roster(명단 해시)·members(인증된 학생)·views(시청 기록) Firebase JSON 을 구조체로. 경로·필드는 홈페이지 lecture.html 과 동일
import Foundation

struct LectureVideo: Identifiable, Equatable {
    var id: String; var yt: String; var title: String; var unit: String; var date: String; var order: Double; var note: String; var createdAt: Double
    var thumb: URL { URL(string: "https://i.ytimg.com/vi/\(yt)/mqdefault.jpg")! }
    var embed: URL { URL(string: "https://www.youtube-nocookie.com/embed/\(yt)?playsinline=1&rel=0")! }
    var plain: [String: Any] { ["yt": yt, "title": title, "unit": unit, "date": date, "order": order, "note": note, "createdAt": createdAt] }
    static func parse(_ any: Any?) -> [LectureVideo] {
        FB.dict(any).compactMap { k, v -> LectureVideo? in
            guard let d = v as? [String: Any], let yt = d["yt"] as? String else { return nil }
            return LectureVideo(id: k, yt: yt, title: d["title"] as? String ?? "", unit: d["unit"] as? String ?? "", date: d["date"] as? String ?? "",
                                order: FB.ms(d["order"]), note: d["note"] as? String ?? "", createdAt: FB.ms(d["createdAt"]))
        }.sorted { $0.order != $1.order ? $0.order < $1.order : $0.date > $1.date }
    }
}

struct RosterEntry: Identifiable, Equatable {
    var h: String; var sid: String; var name: String; var at: Double
    var id: String { h }
    static func parse(_ any: Any?) -> [String: RosterEntry] {
        FB.dict(any).reduce(into: [:]) { acc, kv in
            guard let d = kv.value as? [String: Any], let sid = d["sid"] as? String, let name = d["name"] as? String else { return }
            acc[kv.key] = RosterEntry(h: kv.key, sid: sid, name: name, at: FB.ms(d["at"]))
        }
    }
}

struct Member: Identifiable, Equatable {
    var uid: String; var h: String; var sid: String; var name: String; var at: Double
    var id: String { uid }
    static func parse(_ any: Any?) -> [Member] {
        FB.dict(any).compactMap { k, v -> Member? in
            guard let d = v as? [String: Any], let h = d["h"] as? String else { return nil }
            return Member(uid: k, h: h, sid: d["sid"] as? String ?? "", name: d["name"] as? String ?? "", at: FB.ms(d["at"]))
        }.sorted { $0.at > $1.at }
    }
}

struct ViewRecord: Equatable {
    var sec: Double; var dur: Double; var n: Int; var at: Double; var done: Bool
    var watchedSec: Double? = nil; var progressVersion: Int = 1
    var measured: Bool { progressVersion == 2 }
    var pct: Double { dur > 0 ? min(1, max(0, (measured ? watchedSec ?? 0 : sec) / dur)) : 0 }
    static func best(_ records: [ViewRecord]) -> ViewRecord? {
        let completed=records.filter(\.done)
        let measured=records.filter(\.measured)
        let candidates = !completed.isEmpty ? completed : !measured.isEmpty ? measured : records
        return candidates.max { $0.pct == $1.pct ? $0.at < $1.at : $0.pct < $1.pct }
    }
    /// views/{videoId}/{uid}
    static func parse(_ any: Any?) -> [String: [String: ViewRecord]] {
        FB.dict(any).reduce(into: [:]) { acc, kv in
            let inner = FB.dict(kv.value).reduce(into: [String: ViewRecord]()) { a, u in
                guard let d = u.value as? [String: Any] else { return }
                a[u.key] = ViewRecord(sec: FB.ms(d["sec"]), dur: FB.ms(d["dur"]), n: Int(FB.ms(d["n"])), at: FB.ms(d["at"]), done: (d["done"] as? Bool) ?? false, watchedSec: (d["watchedSec"] as? NSNumber)?.doubleValue, progressVersion: Int(FB.ms(d["progressVersion"])))
            }
            if !inner.isEmpty { acc[kv.key] = inner }
        }
    }
}
