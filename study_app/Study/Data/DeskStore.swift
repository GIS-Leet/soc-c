// desk 데이터 스토어 — 실시간 스트림으로 받아 화면에 공급하고, 변경은 REST로 씀 (PC와 같은 경로)
import SwiftUI
import CryptoKit

enum SaveState: Equatable { case savingLocally, pending(count: Int), synced, failed(message: String) }

@MainActor
final class DeskStore: ObservableObject {
    static let shared = DeskStore()
    @Published var todos: [Todo] = []
    @Published var ddays: [DDay] = []
    @Published var calendar: [String: [CalEvent]] = [:]
    @Published var notes: [Note] = []
    @Published var sessions: [StudySession] = []
    @Published var questions: [Question] = []
    @Published var quizlog: [String: Any] = [:]
    @Published var progress = Progress()
    @Published var notices: [Notice] = []
    @Published var dailyPhone: [String: Any] = [:]    // desk/study/daily (아이폰 복습)
    @Published var dailyMac: [String: Any] = [:]      // desk/study/daily-mac (공강 공부 창)
    @Published var requests: [MaterialRequest] = []
    @Published var dailyCards: [DailyCard] = []      // 오늘의 지리·일본어·영어 카드(홈페이지 데이터)
    func refreshDailyCards(force: Bool = false) async { let c = await DailyCards.load(force: force); if c != dailyCards { dailyCards = c } }
    @Published var github: GitHubFiles? = nil        // desk/settings/github
    @Published var videos: [LectureVideo] = []                 // videos — 강의 영상(홈페이지 공개)
    @Published var roster: [String: RosterEntry] = [:]         // roster — 홈페이지 인증 명단(키 = 해시)
    @Published var members: [Member] = []                      // members — 인증을 마친 학생(익명 uid)
    @Published var views: [String: [String: ViewRecord]] = [:] // views — videoId → uid → 시청 기록
    @Published var studentsEnc: [String: ClassCrypto.Blob] = [:]   // 암호문 그대로(잠금 해제 전)
    @Published private var classMetadataMalformed = false
    @Published private var malformedStudents = 0
    enum ClassMetadataState { case loading, absent, present, failed }
    var classMetadataState: ClassMetadataState {
        if classMetadataMalformed { return .failed }
        if classMeta != nil { return .present }
        if streamErrors["desk/class"] != nil { return .failed }
        return receivedPaths.contains("desk/class") ? .absent : .loading
    }
    @Published var classMeta: (salt: String, check: ClassCrypto.Blob)? = nil
    @Published var chartsEnc: [String: ClassCrypto.Blob] = [:]      // 좌석표 암호문
    var unanswered: Int { questions.filter(\.open).count }
    @Published private(set) var receivedPaths: Set<String> = []
    @Published private(set) var streamErrors: [String: String] = [:]
    @Published private(set) var cachedPaths: Set<String> = []
    @Published var ready = false          // Firebase 로그인 됨
    @Published var error: String?
    @Published var saveState: SaveState = .synced
    private var snapshots: [String: Any] = [:]
    private var replyTickets: [String: (id: String, time: String)] = [:]
    @Published var pending = WriteQueue.pending().count   // 아직 못 보낸 변경
    private var tasks: [Task<Void, Never>] = []
    private var cacheLoaded = false
    nonisolated static let cacheDir: URL = { let d = TestRuntime.storage("desk-cache") { FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("desk-cache", isDirectory: true) }; try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d }()
    private var streams: [(String, (Any?) -> Void)] {[
        ("desk/todos", { self.todos = Todo.parse($0) }),
        ("desk/ddays", { self.ddays = DDay.parse($0) }),
        ("desk/calendar", { self.calendar = CalEvent.parse($0) }),
        ("desk/notes", { self.notes = Note.parse($0) }),
        ("desk/study/sessions", { self.sessions = StudyStats.parse($0) }),
        ("questions", { self.questions = Question.parse($0) }),
        ("desk/study/quizlog", { self.quizlog = FB.dict($0) }),
        ("progress", { self.progress = Progress.parse($0) }),
        ("notices", { self.notices = Notice.parse($0) }),
        ("desk/study/daily", { self.dailyPhone = FB.dict($0) }),
        ("desk/study/daily-mac", { self.dailyMac = FB.dict($0) }),
        ("desk/requests", { self.requests = MaterialRequest.parse($0) }),
        ("desk/settings/github", { self.github = GitHubCredential.read($0) }),
        ("videos", { self.videos = LectureVideo.parse($0) }),
        ("roster", { self.roster = RosterEntry.parse($0) }),
        ("members", { self.members = Member.parse($0) }),
        ("views", { self.views = ViewRecord.parse($0) }),
        ("desk/class", {
            let d = FB.dict($0)
            self.classMetadataMalformed = d["meta"] != nil && (ClassCrypto.blob(FB.dict(d["meta"])["check"]) == nil || FB.dict(d["meta"])["salt"] as? String == nil)
            if let m = d["meta"] as? [String: Any], let salt = m["salt"] as? String, let chk = ClassCrypto.blob(m["check"]) { self.classMeta = (salt, chk) } else { self.classMeta = nil }
            self.studentsEnc = FB.dict(d["students"]).reduce(into: [:]) { acc, kv in if let b = ClassCrypto.blob((kv.value as? [String: Any])?["enc"]) { acc[kv.key] = b } }
            self.malformedStudents = FB.dict(d["students"]).count - self.studentsEnc.count
            self.chartsEnc = FB.dict(d["seating"]).reduce(into: [:]) { acc, kv in if let b = ClassCrypto.blob((kv.value as? [String: Any])?["enc"]) { acc[kv.key] = b } }
        })
    ]}
    /// 마지막 스냅샷을 먼저 그림(즉시 표시·오프라인) → 로그인 → 스트림. 큐에 남은 변경도 보냄
    func start() async {
        guard !Backup.hasInterruptedRestore else { Report.log("복원 대기", CocoaError(.fileReadCorruptFile),show:true); return }
        refreshSaveState()
        if TestRuntime.isTesting {   // 화면 테스트: 번들 픽스처로 채우고 네트워크 없이
            if !cacheLoaded { cacheLoaded = true; for (path, apply) in streams { if let u = Bundle.main.url(forResource: path.replacingOccurrences(of: "/", with: "_"), withExtension: "json", subdirectory: "fixtures"), let d = try? Data(contentsOf: u), let v = try? JSONSerialization.jsonObject(with: d) { snapshots[path] = v; apply(WriteQueue.overlay(v, at: path)) } }
                if let u = Bundle.main.url(forResource: "desk_timetable", withExtension: "json", subdirectory: "fixtures"), let d = try? Data(contentsOf: u), let v = try? JSONSerialization.jsonObject(with: d) { TimetableStore.timetable = Timetable.parse(v) }
                ready = true }
            refreshSaveState(); return
        }
        if !cacheLoaded { cacheLoaded = true; for (path, apply) in streams { let v = Self.loadCache(path); if v != nil { cachedPaths.insert(path) }; snapshots[path] = v ?? NSNull(); apply(WriteQueue.overlay(v, at: path)) } }
        guard tasks.isEmpty else { await drainQueue(); return }
        do {
            if await !FirebaseSession.shared.hasRefreshToken, let t = await Auth.tokens() { _ = try await FirebaseSession.shared.signIn(googleIDToken: t.id, accessToken: t.access) }
            _ = try await FirebaseSession.shared.token()
            ready = true; error = nil; Report.shared.needsSignIn = false
        } catch { self.error = error.localizedDescription; ready = false; Report.shared.needsSignIn = error is FirebaseSession.NotSignedIn; Report.shared.fail("로그인", error, show: false); return }
        for (path, apply) in streams { observe(path, apply) }
        await drainQueue()
    }
    nonisolated static func cacheURL(_ path: String) -> URL { cacheDir.appendingPathComponent(path.replacingOccurrences(of: "/", with: "_") + ".json") }
    nonisolated static func loadCache(_ path: String) -> Any? {
        guard let data = try? Data(contentsOf: cacheURL(path)), let value = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else { return nil }
        if path == "desk/settings/github" {
            _ = GitHubCredential.read(value)
            let safe = GitHubCredential.safeSnapshot(value)
            if let data = try? JSONSerialization.data(withJSONObject: safe, options: [.fragmentsAllowed]) { try? data.write(to: cacheURL(path), options: .atomic) }
            return safe
        }
        return value
    }

    private func saveCache(_ path: String, _ snap: Any?) throws {
        let url = Self.cacheURL(path)
        let safe = path == "desk/settings/github" ? GitHubCredential.safeSnapshot(snap ?? NSNull()) : (snap ?? NSNull())
        let data = try JSONSerialization.data(withJSONObject: safe, options: [.fragmentsAllowed])
        try data.write(to: url, options: .atomic)
    }
    nonisolated static func clearCache() { try? FileManager.default.removeItem(at: cacheDir); try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true) }
    /// 큐에 남은 변경 전송
    @Published var pendingUploads = TestRuntime.isTesting ? 0 : UploadQueue.pending().count
    private func refreshSaveState() {
        pending = WriteQueue.pending().count
        if !WriteQueue.engine.recovery.isEmpty { saveState = .failed(message: "기기에 저장하지 못한 변경이 있습니다. 앱을 닫기 전에 재시도하세요."); return }
        if let failure = WriteQueue.failure ?? WriteQueue.pending().compactMap(\.failure).first { saveState = .failed(message: failure) }
        else { saveState = pending == 0 ? .synced : .pending(count: pending) }
    }
    func drainQueue(retryFailures: Bool = false) async {
        let result = await WriteQueue.drain(retryBlocked: retryFailures)
        refreshSaveState()
        if !TestRuntime.isTesting { pendingUploads = await UploadQueue.drain(gh: github) }
        if let message = result.dropped { error = "변경을 보관했습니다. 재시도 필요: \(message)" }
    }
    @discardableResult private func write(_ method: String, _ path: String, _ value: Any? = nil) -> Bool {
        saveState = .savingLocally
        let result = WriteQueue.enqueue(method, path, value)
        switch result {
        case .failure(let failure):
            error = "기기에 저장하지 못했습니다: \(failure.localizedDescription)"
            saveState = .failed(message: error!); return false
        case .success:
            refreshSaveState()
            for (observedPath, apply) in streams where path == observedPath || path.hasPrefix(observedPath + "/") || observedPath.hasPrefix(path + "/") {
                let snapshot = snapshots[observedPath]
                apply(WriteQueue.overlay(snapshot is NSNull ? nil : snapshot, at: observedPath))
            }
            Task { await drainQueue() }; return true
        }
    }
    @discardableResult func qput(_ path: String, _ v: Any) -> Bool { write("put", path, v) }
    @discardableResult func qpatch(_ path: String, _ v: [String: Any]) -> Bool { write("patch", path, v) }
    @discardableResult func qdelete(_ path: String) -> Bool { write("delete", path) }
    private func observe(_ path: String, _ apply: @escaping (Any?) -> Void) {
        tasks.append(Task {
            for await event in RTDB.observe(path, acknowledgedIDs: { WriteQueue.acknowledgedIDs() }, onError: { message in Task { @MainActor in self.error = message; self.streamErrors[path] = message } }) {
                if Task.isCancelled { break }
                let snap = event.value
                receivedPaths.insert(path); streamErrors.removeValue(forKey: path); snapshots[path] = snap ?? NSNull()
                do {
                    // 서버 원본을 먼저 보존한다. 미확인 변경은 큐에 남아 재시작 때 합성된다.
                    try saveCache(path, snap)
                    try WriteQueue.confirmServerSnapshot(snap, at: path, authoritativeAfter: event.acknowledgedBeforeConnection).get()
                } catch { self.error = "캐시 저장 실패: \(error.localizedDescription)" }
                apply(WriteQueue.overlay(snap, at: path))
                refreshSaveState()
            }
        })
    }
    func reloadRestoredCache() { stop(); cacheLoaded = false; cachedPaths.removeAll() }
    func stop() { receivedPaths.removeAll(); streamErrors.removeAll(); snapshots.removeAll(); tasks.forEach { $0.cancel() }; tasks = []; ready = false }
    func run(revert: (() -> Void)? = nil, _ op: @escaping () async throws -> Void) {
        Task { do { try await op(); error = nil } catch { revert?(); self.error = error.localizedDescription; Report.shared.fail("저장", error) } }
    }

    // ── 오늘 ──
    var todayEvents: [CalEvent] { calendar[FB.key(Date())] ?? [] }
    func events(on d: Date) -> [CalEvent] { calendar[FB.key(d)] ?? [] }
    var upcoming: [(date: String, events: [CalEvent])] { upcoming(from: Date()) }
    /// 기준일 다음 7일(기준일 제외) 일정
    func upcoming(from base: Date) -> [(date: String, events: [CalEvent])] {
        let cal = Calendar.current
        return (1...7).compactMap { i in
            guard let d = cal.date(byAdding: .day, value: i, to: base) else { return nil }
            let k = FB.key(d); guard let e = calendar[k], !e.isEmpty else { return nil }
            return (k, e)
        }
    }
    var streak: Int { StudyStats.streak(StudyStats.minutesByDay(sessions)) }
    var todayMinutes: Int { StudyStats.minutesByDay(sessions)[FB.key(Date())] ?? 0 }

    // ── 할 일 ──
    func toggle(_ t: Todo) {
        if let i = todos.firstIndex(where: { $0.id == t.id }) { todos[i].done.toggle() }   // 화면 먼저
        qpatch("desk/todos/\(t.id)", ["done": !t.done])
    }
    func addTodo(_ text: String, due: String?) {
        var v: [String: Any] = ["text": text, "done": false, "createdAt": Date().timeIntervalSince1970 * 1000]
        if let due { v["due"] = due }
        let id = RTDB.pushKey(); todos = Todo.parse([id: v]) + todos; qput("desk/todos/\(id)", v)
    }
    func deleteTodo(_ t: Todo) { todos.removeAll { $0.id == t.id }; qdelete("desk/todos/\(t.id)") }
    // ── 홈페이지 공지 ──
    func addNotice(_ text: String, date: String) { let v: [String: Any] = ["date": date, "text": text, "createdAt": Date().timeIntervalSince1970 * 1000]; let id = RTDB.pushKey(); notices = Notice.parse([id: v]) + notices; qput("notices/\(id)", v) }
    func deleteNotice(_ n: Notice) { notices.removeAll { $0.id == n.id }; qdelete("notices/\(n.id)") }
    // ── 일정·디데이 ──
    func addEvent(_ date: String, _ text: String) { let id = RTDB.pushKey(); calendar[date, default: []].append(CalEvent(id: id, date: date, text: text)); qput("desk/calendar/\(date)/\(id)", ["text": text]) }
    func deleteEvent(_ e: CalEvent) { calendar[e.date]?.removeAll { $0.id == e.id }; qdelete("desk/calendar/\(e.date)/\(e.id)") }
    func addDDay(_ label: String, _ date: String) { let v = ["label": label, "date": date]; let id = RTDB.pushKey(); ddays = DDay.parse([id: v]) + ddays; qput("desk/ddays/\(id)", v) }
    func deleteDDay(_ d: DDay) { ddays.removeAll { $0.id == d.id }; qdelete("desk/ddays/\(d.id)") }
    // ── 노트 ──
    func newNote() async -> String? {
        let now = Date().timeIntervalSince1970 * 1000, id = RTDB.pushKey()
        let v: [String: Any] = ["title": "", "md": "", "createdAt": now, "updatedAt": now]
        notes.insert(Note(id: id, title: "", md: "", createdAt: now, updatedAt: now, pinned: false), at: 0); qput("desk/notes/\(id)", v)
        return id
    }
    /// 저장 — 첫 저장 전 이전 버전을 notes-prev 에 남김 (PC와 동일)
    @discardableResult func saveNote(_ id: String, title: String, md: String, keepPrev prev: Note?) -> Bool {
        let now = Date().timeIntervalSince1970 * 1000
        var changes: [String: Any] = ["notes/\(id)/title": title, "notes/\(id)/md": md, "notes/\(id)/updatedAt": now]
        if let previous = prev, !(previous.title.isEmpty && previous.md.isEmpty) { changes["notes-prev/\(id)"] = ["title": previous.title, "md": previous.md, "savedAt": now] }
        return qpatch("desk", changes)
    }
    func pin(_ n: Note) {
        if let i = notes.firstIndex(where: { $0.id == n.id }) { notes[i].pinned.toggle(); notes.sort { a, b in a.pinned != b.pinned ? a.pinned : a.updatedAt > b.updatedAt } }
        qpatch("desk/notes/\(n.id)", ["pinned": !n.pinned])
    }
    func deleteNote(_ n: Note) { notes.removeAll { $0.id == n.id }; qdelete("desk/notes/\(n.id)") }
}


// ── Q&A ──
extension DeskStore {
    /// APNs 토큰을 desk/push/tokens/{token} 에 저장(폴러가 읽어 새 질문 푸시). 로그인 뒤·토큰 바뀔 때만
    func uploadPushToken() async {
        guard ready, let t = TimetableStore.pushToken, t != TimetableStore.pushTokenUploaded else { return }
        let name = await MainActor.run { UIDevice.current.name }
        if (try? await RTDB.put("desk/push/tokens/\(t)", ["at": Date().timeIntervalSince1970 * 1000, "env": "development", "name": name])) != nil { TimetableStore.pushTokenUploaded = t }
    }
    /// 학생 후속 대댓글을 답변 없이 '확인함'으로 — 미답변 목록에서 빠짐(PC desk 와 같은 필드)
    func resolveFollowUp(_ q: Question) {
        let now = Date().timeIntervalSince1970 * 1000
        if let i = questions.firstIndex(where: { $0.id == q.id }) { questions[i].followUpResolvedAt = now }
        qpatch("questions/\(q.id)", ["followUpResolvedAt": now])
    }
    @discardableResult func reply(_ q: Question, _ text: String) -> Bool {
        let slot = "reply/" + q.id
        let ticket = replyTickets[slot] ?? (id: RTDB.pushKey(), time: Question.timeString())
        replyTickets[slot] = ticket
        let saved = qput("questions/\(q.id)/replies/\(ticket.id)", ["text": text, "imageUrl": "", "time": ticket.time, "isTeacher": true])
        if saved { replyTickets.removeValue(forKey: slot) }
        return saved
    }
    func deleteReply(_ q: Question, _ r: Reply) {
        if let i = questions.firstIndex(where: { $0.id == q.id }) { questions[i].replies.removeAll { $0.id == r.id } }
        qdelete("questions/\(q.id)/replies/\(r.id)")
    }
    func deleteQuestion(_ q: Question) { questions.removeAll { $0.id == q.id }; qdelete("questions/\(q.id)") }
    /// 답글에 대댓글 (학생 페이지와 같은 형식, 교사는 author '관리자')
    @discardableResult func subReply(_ q: Question, _ r: Reply, _ text: String) -> Bool {
        let slot = "subreply/" + q.id + "/" + r.id
        let ticket = replyTickets[slot] ?? (id: RTDB.pushKey(), time: Question.timeString())
        replyTickets[slot] = ticket
        let saved = qput("questions/\(q.id)/replies/\(r.id)/subReplies/\(ticket.id)", ["author": "관리자", "text": text, "imageUrl": "", "isTeacher": true, "time": ticket.time])
        if saved { replyTickets.removeValue(forKey: slot) }
        return saved
    }
    func deleteSubReply(_ q: Question, _ r: Reply, _ s: SubReply) {
        if let i = questions.firstIndex(where: { $0.id == q.id }), let j = questions[i].replies.firstIndex(where: { $0.id == r.id }) { questions[i].replies[j].subReplies.removeAll { $0.id == s.id } }
        qdelete("questions/\(q.id)/replies/\(r.id)/subReplies/\(s.id)")
    }
}
// ── 오늘 몫(공강 공부 + 아이폰 복습 통합) ──
struct DailyGoal: Equatable { var geo: Bool; var jp: Bool; var en: Bool; var hasEn: Bool; var geoScore: String?; var jpScore: String?; var source: String
    var done: Int { (geo ? 1 : 0) + (jp ? 1 : 0) + (hasEn && en ? 1 : 0) }; var total: Int { hasEn ? 3 : 2 } }
extension DeskStore {
    func dailyGoal(_ date: Date = Date()) -> DailyGoal {
        let k = FB.key(date); let a = FB.dict(dailyPhone[k]), b = FB.dict(dailyMac[k])
        func ok(_ d: [String: Any], _ key: String) -> (Bool, String?) { let e = FB.dict(d[key]); guard !e.isEmpty else { return (false, nil) }; let sc = Int(FB.ms(e["score"])), t = Int(FB.ms(e["total"])); return (t == 0 || sc >= max(1, t - 1), t > 0 ? "\(sc)/\(t)" : nil) }
        let g1 = ok(a, "geo"), g2 = ok(b, "geo"), j1 = ok(a, "jp"), j2 = ok(b, "jp")
        let src = (!a.isEmpty && !b.isEmpty) ? "폰+Mac" : !a.isEmpty ? "폰" : !b.isEmpty ? "Mac" : ""
        let en = !FB.dict(a["en"]).isEmpty || !FB.dict(b["en"]).isEmpty
        return DailyGoal(geo: g1.0 || g2.0, jp: j1.0 || j2.0, en: en, hasEn: dailyCards.contains { $0.subject == "영어" }, geoScore: g1.1 ?? g2.1, jpScore: j1.1 ?? j2.1, source: src)
    }
    /// 최근 30일 단원별 질문 수 — 진도 카드 「질문 몰림」
    func questionHeat(days: Int = 30) -> [(unit: String, n: Int)] {
        let since = Date().addingTimeInterval(-Double(days) * 86400).timeIntervalSince1970 * 1000
        let recent = questions.filter { $0.timestamp >= since }
        let units = Array(NSOrderedSet(array: progress.lessons.map(\.unit)).array as? [String] ?? [])
        return units.map { u in
            let keys = Set(LessonPrep.tokens(u) + progress.lessons.filter { $0.unit == u }.flatMap { LessonPrep.tokens($0.title) }).filter { $0.count >= 2 }
            let n = recent.filter { q in let t = (q.title + " " + q.text).lowercased(); return keys.contains { t.contains($0.lowercased()) } }.count
            return (u, n)
        }.filter { $0.n > 0 }.sorted { $0.n > $1.n }
    }
    /// 제작 요청 — Mac 인박스로
    func requestMaterial(type: String, title: String, md: String) {
        let id = RTDB.pushKey(); let v: [String: Any] = ["type": type, "title": title, "md": md, "status": "pending", "createdAt": Date().timeIntervalSince1970 * 1000]
        requests.insert(MaterialRequest(id: id, type: type, title: title, md: md, status: "pending", createdAt: Date().timeIntervalSince1970 * 1000, result: nil), at: 0)
        qput("desk/requests/\(id)", v)
    }
    // MARK: 강의 영상·홈페이지 명단
    func addVideo(yt: String, title: String, unit: String, date: String, note: String) {
        let id = RTDB.pushKey()
        let v = LectureVideo(id: id, yt: yt, title: title, unit: unit, date: date, order: (videos.map(\.order).min() ?? 0) - 1, note: note, createdAt: Date().timeIntervalSince1970 * 1000)
        videos = LectureVideo.parse([id: v.plain]) + videos; qput("videos/\(id)", v.plain)
    }
    func updateVideo(_ v: LectureVideo) {
        if let i = videos.firstIndex(where: { $0.id == v.id }) { videos[i] = v }
        qpatch("videos/\(v.id)", ["title": v.title, "unit": v.unit, "date": v.date, "note": v.note, "yt": v.yt])
    }
    func deleteVideo(_ id: String) { videos.removeAll { $0.id == id }; qdelete("videos/\(id)"); qdelete("views/\(id)") }
    /// 붙여 넣은 명단으로 roster 전체를 바꾼다(해시 = 홈페이지와 같은 규칙)
    func publishRoster(_ entries: [RosterLine.Entry]) {
        let now = Date().timeIntervalSince1970 * 1000
        let plain = entries.reduce(into: [String: Any]()) { $0[RosterHash.h(sid: $1.sid, name: $1.name)] = ["sid": $1.sid, "name": $1.name, "at": now] }
        roster = RosterEntry.parse(plain); qput("roster", plain.isEmpty ? NSNull() : plain)
    }
    func removeRosterEntry(_ h: String) { roster[h] = nil; qdelete("roster/\(h)") }
    func isVerified(_ h: String) -> Bool { members.contains { $0.h == h } }
    /// 명단 전체를 학번 순으로, 각 학생의 이 영상 시청 기록(여러 uid 로 인증했으면 가장 많이 본 것)
    func watchers(of v: LectureVideo) -> [(entry: RosterEntry, rec: ViewRecord?)] {
        let recs = views[v.id] ?? [:]
        return roster.values.sorted { $0.sid < $1.sid }.map { e in
            let mine = ViewRecord.best(members.filter { $0.h == e.h }.compactMap { recs[$0.uid] })
            return (e, mine)
        }
    }
}
// ── 진도 ──
extension DeskStore {
    func step(_ c: ProgressClass, _ delta: Int) {
        let total = progress.lessons.count, done = max(0, min(total, c.done + delta))
        guard done != c.done else { return }
        if let i = progress.classes.firstIndex(where: { $0.id == c.id }) { progress.classes[i].done = done }
        qpatch("progress/classes/\(c.id)", ["done": done])
    }
}
// ── 상담 (암호화) ──
extension DeskStore {
    /// 암호구절로 키 만들고 검증 문자열로 확인. 성공하면 키 반환(세션 메모리에만)
    func unlockClass(_ pass: String) throws -> SymmetricKey {
        guard let meta = classMeta else { throw ClassCrypto.BadPass() }
        guard let key = ClassCrypto.key(pass: pass, saltB64: meta.salt), (try? ClassCrypto.decrypt(meta.check, key: key)) as? String == ClassCrypto.checkText else { throw ClassCrypto.BadPass() }
        return key
    }
    /// 처음 설정: 새 salt + 검증 문자열 저장
    func setupClass(_ pass: String) async throws -> SymmetricKey {
        guard classMetadataState == .absent else { throw ClassEditError.setupUnavailable }
        let result = try await ClassPersistence().setup(pass)
        classMeta = (result.salt, result.check)
        return result.key
    }
    func students(key: SymmetricKey) -> [Student] {
        studentsEnc.compactMap { id, b in (try? ClassCrypto.decrypt(b, key: key)).flatMap { Student.from(id, $0) } }
            .sorted { (Int($0.num) ?? 999, $0.name) < (Int($1.num) ?? 999, $1.name) }
    }
    func unreadableStudents(key: SymmetricKey) -> Int { malformedStudents + studentsEnc.count - students(key: key).count }
    @discardableResult func editStudent(_ id: String, _ edit: StudentEdit, key: SymmetricKey) async -> Bool {
        do {
            if case .setNote(let note, let baseline) = edit { try ClassDrafts.save(id, note: note, baseline: baseline, key: key) }
            let blob = try await ClassPersistence().edit(id, edit, key: key)
            studentsEnc[id] = blob
            if case .setNote(let note, let baseline) = edit { try ClassDrafts.confirmSaved(id, note: note, baseline: baseline, key: key) }
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func newStudent(num: String, name: String, key: SymmetricKey) async -> Student? {
        let s = Student(id: "", num: num, name: name, note: "", logs: [])
        do { let b = try ClassCrypto.encrypt(s.plain, key: key); let id = try await RTDB.push("desk/class/students", ["enc": ["iv": b.iv, "ct": b.ct]]); return Student(id: id, num: num, name: name, note: "", logs: []) }
        catch { self.error = error.localizedDescription; return nil }
    }
    func deleteStudent(_ s: Student) { studentsEnc.removeValue(forKey: s.id); qdelete("desk/class/students/\(s.id)") }
}

// ── 상담 사진 (JPEG → base64 → AES-GCM → desk/class/photos/{id}) ──
extension DeskStore {
    func savePhoto(_ jpeg: Data, key: SymmetricKey) async -> String? {
        do { let b = try ClassCrypto.encrypt(jpeg.base64EncodedString(), key: key); return try await RTDB.push("desk/class/photos", ["iv": b.iv, "ct": b.ct]) }
        catch { self.error = error.localizedDescription; return nil }
    }
    func loadPhoto(_ id: String, key: SymmetricKey) async -> Data? {
        guard let v = try? await RTDB.get("desk/class/photos/\(id)"), let b = ClassCrypto.blob(v), let s = try? ClassCrypto.decrypt(b, key: key) as? String else { return nil }
        return Data(base64Encoded: s)
    }
}
// ── 스트릭 프리즈: 어제 기록이 없을 때 주 1회, 어제 날짜에 0분 세션 ──
extension DeskStore {
    var yesterdayKey: String { FB.key(Calendar.current.date(byAdding: .day, value: -1, to: Date())!) }
    var canFreeze: Bool {
        let byDay = StudyStats.minutesByDay(sessions)
        guard byDay[yesterdayKey] == nil, byDay[FB.key(Date())] != nil else { return false }
        let ws = WeeklyReport.weekStart(Date())
        return !sessions.contains { $0.subject == "스트릭 프리즈" && (FB.day.date(from: $0.date) ?? .distantPast) >= ws.addingTimeInterval(-86400) }
    }
    /// 공부 외 루틴 기록(발성 등) — 잔디·연속 일수에 반영
    func logSession(subject: String, minutes: Int, now: Date = Date()) {
        let k = FB.key(now), ms = now.timeIntervalSince1970 * 1000
        sessions.append(StudySession(date: k, min: minutes, subject: subject))
        qput("desk/study/sessions/\(RTDB.pushKey())", ["subject": subject, "note": "루틴", "start": ms - Double(minutes) * 60_000, "end": ms, "min": minutes, "date": k, "morning": false])
    }
    func freezeStreak() {
        let y = yesterdayKey
        sessions.append(StudySession(date: y, min: 0, subject: "스트릭 프리즈"))
        qput("desk/study/sessions/\(RTDB.pushKey())", ["subject": "스트릭 프리즈", "note": "프리즈", "start": Date().timeIntervalSince1970 * 1000, "end": Date().timeIntervalSince1970 * 1000, "min": 0, "date": y, "morning": false, "freeze": true])
    }
}
// ── 좌석표 (암호화, desk/class/seating/{id}) ──
extension DeskStore {
    func charts(key: SymmetricKey) -> [SeatChart] {
        chartsEnc.compactMap { id, b in (try? ClassCrypto.decrypt(b, key: key)).flatMap { SeatChart.from(id, $0) } }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    func saveChart(_ c: SeatChart, key: SymmetricKey) {
        if let b = try? ClassCrypto.encrypt(c.plain, key: key) { chartsEnc[c.id] = b; qput("desk/class/seating/\(c.id)", ["enc": ["iv": b.iv, "ct": b.ct]]) }   // 화면 먼저
    }
    func newChart(name: String, rows: Int, cols: Int, key: SymmetricKey) async -> SeatChart? {
        let c = SeatChart(id: "", name: name, rows: rows, cols: cols)
        do { let b = try ClassCrypto.encrypt(c.plain, key: key); let id = try await RTDB.push("desk/class/seating", ["enc": ["iv": b.iv, "ct": b.ct]]); return SeatChart(id: id, name: name, rows: rows, cols: cols) }
        catch { self.error = error.localizedDescription; return nil }
    }
    func deleteChart(_ c: SeatChart) { chartsEnc.removeValue(forKey: c.id); qdelete("desk/class/seating/\(c.id)") }
}
