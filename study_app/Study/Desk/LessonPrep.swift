// 수업 준비 — 시간표의 지금/다음 수업 → 교실 번호로 반을 찾고 → 진도의 다음 차시 → 이름이 맞는 자료를 추천. 필기 화면에 넘길 수업 맥락도 여기서 만든다
import Foundation
import PDFKit

/// 필기 화면이 알고 있는 "어느 반 몇 차시" — 닫을 때 필기본 저장·진도 +1 제안에 씀
struct LessonContext: Equatable {
    var classID: String?; var className: String; var room: String; var lessonNo: Int?; var lessonTitle: String?; var date: Date; var period: Int? = nil
    var label: String { [className, lessonNo.map { "\($0)차시" }, lessonTitle].compactMap { $0 }.joined(separator: " · ") }
    /// 필기본 파일 이름: 2026-09-11 3반 5차시 세계화의문제점-필기.pdf
    var fileName: String {
        let t = (lessonTitle ?? "수업").replacingOccurrences(of: "[^가-힣A-Za-z0-9]", with: "", options: .regularExpression).prefix(16)
        return "\(FB.key(date)) \(className) \(lessonNo.map { "\($0)차시 " } ?? "")\(t)-필기.pdf"
    }
}

struct LessonPrep: Equatable {
    var slot: Timetable.Slot; var date: Date; var isNow: Bool; var room: String
    var cls: ProgressClass?; var lesson: Lesson?; var files: [GHFile]
    var context: LessonContext { LessonContext(classID: cls?.id, className: cls?.name ?? room, room: room, lessonNo: lesson?.order, lessonTitle: lesson?.title, date: date, period: slot.period) }

    /// "103 통사2C" → 교실 "103" → 반 3 (마지막 두 자리)
    static func room(of subject: String) -> String { subject.split(separator: " ").first.map(String.init) ?? subject }
    static func classNumber(room: String) -> Int? { guard room.count == 3, let n = Int(room) else { return nil }; return n % 100 }
    /// 반 이름 "3반" 과 교실 매칭
    static func progressClass(for room: String, in classes: [ProgressClass]) -> ProgressClass? {
        guard let n = classNumber(room: room) else { return nil }
        return classes.first { Int($0.name.replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression)) == n }
    }
    /// 제목·단원의 낱말이 파일 이름에 들어 있는 정도로 점수
    static func tokens(_ s: String) -> [String] {
        s.replacingOccurrences(of: "[①②③④⑤⑥⑦⑧⑨⑩()\\[\\]·,:/]", with: " ", options: .regularExpression)
            .split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "_" }).map { String($0) }.filter { $0.count >= 2 }
    }
    static func match(lesson: Lesson?, files: [GHFile], limit: Int = 3) -> [GHFile] {
        guard let lesson else { return [] }
        let keys = Array(Set(tokens(lesson.title) + tokens(lesson.unit) + tokens(lesson.title).flatMap { t in t.count >= 4 ? [String(t.prefix(2)), String(t.suffix(2))] : [] }))
        let scored = files.compactMap { f -> (GHFile, Int)? in
            let name = f.name.lowercased(); var sc = 0
            for k in keys where name.contains(k.lowercased()) { sc += k.count >= 3 ? 3 : 1 }
            if name.contains("-필기") { sc -= 1 }
            return sc > 0 ? (f, sc) : nil
        }
        return scored.sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.name < $1.0.name }.prefix(limit).map(\.0)
    }
    /// 지금 수업 중이면 그 수업, 아니면 오늘 다음 수업, 오늘 끝났으면 다음 평일 첫 수업
    static func plan(table: Timetable?, progress: Progress, files: [GHFile], now: Date = Date(), cal: Calendar = .current) -> LessonPrep? {
        guard let t = table else { return nil }
        let f = t.focus(at: now, cal: cal)
        let slot: Timetable.Slot?; let isNow: Bool
        if f.shifted { slot = t.slots(on: f.date, cal: cal).first { $0.subject != nil }; isNow = false }
        else if let c = t.current(at: now, cal: cal) { slot = c; isNow = true }
        else { slot = t.next(at: now, cal: cal); isNow = false }
        guard let slot, let subject = slot.subject else { return nil }
        let room = room(of: subject)
        let cls = progressClass(for: room, in: progress.classes)
        let lesson = cls.flatMap { progress.next(for: $0) }
        return LessonPrep(slot: slot, date: f.date, isNow: isNow, room: room, cls: cls, lesson: lesson, files: match(lesson: lesson, files: files))
    }
    /// 자료실 전체(캐시) 목록
    static func cachedFiles(repo: String?) -> [GHFile] { GitHubFiles.folders.flatMap { MaterialsCache.list($0,repo:repo) } }
}

/// 자료 열기(필기용 PDF 준비) — 자료 화면·오늘 카드·답변 도우미가 함께 씀
enum MaterialOpener {
    struct Target: Identifiable { let name: String; let doc: PDFDocument; let key: String; var folder: String; var id: String { key } }
    static func folder(of f: GHFile) -> String { f.path.split(separator: "/").dropLast().last.map(String.init) ?? GitHubFiles.folders[0] }
    static func annotate(_ f: GHFile, gh: GitHubFiles) async throws -> Target {
        let url: URL
        if let c = MaterialsCache.cached(f) { url = c } else { url = try MaterialsCache.store(f, from: try await gh.download(f)) }
        let doc: PDFDocument?
        if (f.name as NSString).pathExtension.lowercased() == "pdf" { doc = PDFDocument(url: url) }
        else {
            let cache = url.deletingLastPathComponent().appendingPathComponent(f.name + ".pdf")
            if let d = PDFDocument(url: cache), d.pageCount > 0 { doc = d }
            else { let data = try await HTMLToPDF.render(url); try? data.write(to: cache); doc = PDFDocument(data: data) }
        }
        guard let doc, doc.pageCount > 0 else { throw NSError(domain: "desk", code: 1, userInfo: [NSLocalizedDescriptionKey: "문서를 열지 못했습니다"]) }
        return Target(name: f.name, doc: doc, key: DocInk.key(for: f.path), folder: folder(of: f))
    }
    enum SaveOutcome { case uploaded, queued }
    /// 먼저 불변 업로드를 기기에 영속화하고 서버 ACK와 대기를 구분한다.
    @discardableResult static func saveOrQueue(_ data: Data, name: String, folder: String, gh: GitHubFiles) async throws -> SaveOutcome {
        let sourceSHA=MaterialsCache.list(folder,repo:gh.repo).first { $0.name == name }?.sha
        let item=try UploadQueue.enqueue(data,folder:folder,name:name,repo:gh.repo,sourceSHA:sourceSHA)
        _ = await UploadQueue.drain(gh:gh)
        if let pending=try UploadQueue.engine.items().first(where:{$0.id==item.id}) {
            if pending.blocked == true { throw NSError(domain:"desk.upload",code:1,userInfo:[NSLocalizedDescriptionKey:"기기에 보관했지만 업로드가 거절되었습니다. 설정의 대기 파일에서 확인하세요."]) }
            return .queued
        }
        return .uploaded
    }
    /// 폴더에 파일 저장(같은 이름이 있으면 덮어씀) 후 목록 캐시 갱신
    static func save(_ data: Data, name: String, folder: String, gh: GitHubFiles) async throws {
        let list = (try? await gh.list(folder)) ?? MaterialsCache.list(folder,repo:gh.repo)
        try await gh.upload(folder, name: name, data: data, existingSha: list.first { $0.name == name }?.sha)
        if let l = try? await gh.list(folder) { MaterialsCache.save(folder,l,repo:gh.repo) }
    }
    /// 자료 목록이 오래됐으면(5분) 세 폴더를 다시 받아 캐시
    static func refreshLists(gh: GitHubFiles) async {
        for folder in GitHubFiles.folders {
            if let at = MaterialsCache.fetchedAt(folder,repo:gh.repo), Date().timeIntervalSince(at) < 300 { continue }
            do { MaterialsCache.save(folder,try await gh.list(folder),repo:gh.repo) } catch { Report.note("자료 목록", error.localizedDescription); return }
        }
    }
}
