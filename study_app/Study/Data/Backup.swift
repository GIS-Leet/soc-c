// 백업 — 기기에 있는 모든 desk 데이터(스냅샷 캐시·필기·시간표·설정)를 JSON 한 파일로 Documents/Backups 에. 주 1회 자동, 언제든 공유. Files 앱에서 보임
import Foundation

enum Backup {
    static let dir: URL = { if TestRuntime.isTesting { let d=TestRuntime.directory.appendingPathComponent("Backups",isDirectory:true);try? FileManager.default.createDirectory(at:d,withIntermediateDirectories:true);return d };let d = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Backups", isDirectory: true); try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d }()
    static var files: [URL] { ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []).filter { $0.pathExtension == "json" && $0.lastPathComponent.hasPrefix("desk-backup-") }.sorted { $0.lastPathComponent > $1.lastPathComponent } }
    static var last: Date? { files.first.flatMap { (try? $0.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate } }
    /// 원격 전용 파일을 제외한 기기 데이터와 대기 작업을 검증 가능한 파일 manifest로 보관한다.
    @MainActor static func snapshot() throws -> BackupArchive {
        guard !WriteQueue.isDraining,!UploadQueue.draining,!InkLocal.draining,!InkLocal.isWriting,!hasInterruptedRestore else { throw BackupArchive.Invalid(message:"전송 작업이 끝난 뒤 백업·복원을 다시 시도해 주세요.") }
        var entries:[BackupArchive.Entry]=[]
        let roots:[String:URL] = ["snapshots":DeskStore.cacheDir,"ink":InkLocal.root,"uploads":UploadQueue.dir,"materials":MaterialsCache.dir,"drafts":ReplyDrafts.directory,"class-drafts":ClassDrafts.url("placeholder").deletingLastPathComponent()]
        for (name,root) in roots {
            guard let enumerator=FileManager.default.enumerator(at:root,includingPropertiesForKeys:[.isRegularFileKey,.isSymbolicLinkKey]) else { continue }
            for case let file as URL in enumerator {
                let properties=try file.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey])
                guard properties.isRegularFile==true,properties.isSymbolicLink != true else { continue }
                var data=try Data(contentsOf:file)
                if name=="snapshots" { let value=try JSONSerialization.jsonObject(with:data,options:.fragmentsAllowed);data=try JSONSerialization.data(withJSONObject:GitHubCredential.safeSnapshot(value),options:.fragmentsAllowed) }
                let relative=String(file.path.dropFirst(root.path.count+1))
                entries.append(BackupArchive.entry(name+"/"+relative,data))
            }
        }
        var operations=try WriteQueue.recordsForBackup()
        // A queued credential update is never a portable backup operation.
        operations.removeAll { $0.path.contains("settings/github") }
        let raw=try JSONSerialization.jsonObject(with:JSONEncoder().encode(operations)) as! [[String:Any]]
        let safe=try raw.map { item -> [String:Any] in
            var item=item
            if let json=item["json"] as? String {
                let value=try JSONSerialization.jsonObject(with:Data(json.utf8),options:.fragmentsAllowed)
                item["json"]=String(decoding:try JSONSerialization.data(withJSONObject:GitHubCredential.safeSnapshot(value),options:.fragmentsAllowed),as:UTF8.self)
            }
            return item
        }
        entries.append(BackupArchive.entry("state/queue.json",try JSONSerialization.data(withJSONObject:safe)))
        var settings:[String:Any] = ["periods":PeriodSchedule.current.plain]
        if let timetable=TimetableStore.timetable { settings["timetable"]=try JSONSerialization.jsonObject(with:JSONEncoder().encode(timetable)) }
        let materialLists=MaterialsCache.defaults.dictionaryRepresentation().filter { $0.key.hasPrefix("mat-list-v2-") || $0.key.hasPrefix("mat-at-v2-") }
        let encodedLists=materialLists.reduce(into:[String:String]()) { result,pair in if let data=pair.value as? Data { result[pair.key]=data.base64EncodedString() } }
        settings["materialLists"]=encodedLists
        entries.append(BackupArchive.entry("state/settings.json",try JSONSerialization.data(withJSONObject:settings)))
        let archive=BackupArchive(entries:entries);_=try archive.validated();return archive
    }
    @MainActor static func make() throws -> URL {
        let archive=try snapshot()
        let formatter=DateFormatter();formatter.dateFormat="yyyyMMdd-HHmmss"
        let url=dir.appendingPathComponent("desk-backup-"+formatter.string(from:Date())+"-"+String(UUID().uuidString.prefix(6))+".json")
        try JSONEncoder().encode(archive).write(to:url,options:[.atomic,.completeFileProtectionUnlessOpen]);return url
    }
    static func read(_ url: URL) throws -> BackupArchive {
        let data=try Data(contentsOf:url)
        if let archive=try? JSONDecoder().decode(BackupArchive.self,from:data) { _=try archive.validated();return archive }
        // Legacy JSON imports only what that format actually contained; the source stays untouched.
        guard let old=try JSONSerialization.jsonObject(with:data) as? [String:Any],old["app"] as? String=="Desk",old["snapshots"] is [String:Any],old["ink"] is [String:Any] else { throw BackupArchive.Invalid(message:"Desk 백업 파일이 아닙니다.") }
        var entries:[BackupArchive.Entry]=[]
        for (name,value) in old["snapshots"] as! [String:Any] { entries.append(BackupArchive.entry("snapshots/"+name+".json",try JSONSerialization.data(withJSONObject:GitHubCredential.safeSnapshot(value),options:.fragmentsAllowed))) }
        for (note,raw) in old["ink"] as! [String:Any] { guard let pages=raw as? [String:Any] else { throw BackupArchive.Invalid(message:"이전 필기 백업을 해독할 수 없습니다.") };for (page,value) in pages { entries.append(BackupArchive.entry("ink/"+note+"/"+page+".json",try JSONSerialization.data(withJSONObject:value))) } }
        entries.append(BackupArchive.entry("state/queue.json",Data("[]".utf8)))
        let settings=old.filter { ["periods","timetable"].contains($0.key) }
        entries.append(BackupArchive.entry("state/settings.json",try JSONSerialization.data(withJSONObject:settings)))
        var archive=BackupArchive(entries:entries);archive.includedRoots=["snapshots","ink"];archive.excluded += ["구형 백업: 녹음·자료 파일·대기 작업 미포함"]
        _=try archive.validated();return archive
    }
    @MainActor static func restore(_ archive: BackupArchive) throws -> URL {
        guard !WriteQueue.isDraining,!UploadQueue.draining,!InkLocal.draining,!InkLocal.isWriting,!hasInterruptedRestore,WriteQueue.engine.recovery.isEmpty else { throw BackupArchive.Invalid(message:"저장·전송 중이거나 기기에 보관하지 못한 변경이 있습니다. 먼저 저장을 마쳐 주세요.") }
        let files=try archive.validated()
        let operations=try JSONDecoder().decode([WriteQueue.Op].self,from:files["state/queue.json"]!)
        guard Set(operations.map(\.id)).count==operations.count else { throw BackupArchive.Invalid(message:"중복 대기 작업 ID가 있습니다.") }
        guard let settings=try JSONSerialization.jsonObject(with:files["state/settings.json"]!) as? [String:Any] else { throw BackupArchive.Invalid(message:"백업 설정을 해독하지 못했습니다.") }
        _ = try settings["timetable"].map { try JSONDecoder().decode(Timetable.self,from:JSONSerialization.data(withJSONObject:$0)) }

        for operation in operations {
            guard ["put","patch","delete","lessonComplete"].contains(operation.method),let root=operation.path.split(separator:"/").first,["desk","questions","videos","roster","progress","notices"].contains(String(root)),!operation.path.contains("settings/github") else { throw BackupArchive.Invalid(message:"허용되지 않는 대기 작업이 포함되어 있습니다.") }
            if let json=operation.json { _=try JSONSerialization.jsonObject(with:Data(json.utf8),options:.fragmentsAllowed) }
        }
        for (path,data) in files where path.hasSuffix(".json") && !path.hasPrefix("materials/") { _=try JSONSerialization.jsonObject(with:data,options:.fragmentsAllowed) }
        let previous=try make() // Keep the original state before touching any existing directory.
        let stage=dir.appendingPathComponent("restore-"+UUID().uuidString,isDirectory:true)
        _=try archive.stage(in:stage)
        let previousQueue=try JSONEncoder().encode(WriteQueue.recordsForBackup())
        let previousSettings=try snapshot().validated()["state/settings.json"]!
        var transaction=RestoreTransaction(journalURL:journalURL,base:dir,destinations:roots,journal:.init(stageName:stage.lastPathComponent,previousQueue:previousQueue,previousSettings:previousSettings))
        try transaction.checkpoint()
        do {
            for name in roots.keys.sorted() where archive.includedRoots.contains(name) { try transaction.install(name) }
            try WriteQueue.engine.restoreRecords(operations)
            applySettings(settings)
            try InkLocal.resetAfterRestore()
            try transaction.finish()
            ReplyDrafts.clearMemory()
        } catch {
            try recoverInterruptedRestore()
            throw error
        }
        return previous
    }
    @MainActor static var roots: [String:URL] { ["snapshots":DeskStore.cacheDir,"ink":InkLocal.root,"uploads":UploadQueue.dir,"materials":MaterialsCache.dir,"drafts":ReplyDrafts.directory,"class-drafts":ClassDrafts.url("placeholder").deletingLastPathComponent()] }
    static var journalURL: URL { dir.appendingPathComponent("restore-transaction.json") }
    static var hasInterruptedRestore: Bool { FileManager.default.fileExists(atPath:journalURL.path) }
    @MainActor private static func applySettings(_ settings: [String:Any]) {
        if let value=settings["timetable"],let data=try? JSONSerialization.data(withJSONObject:value),let timetable=try? JSONDecoder().decode(Timetable.self,from:data) { TimetableStore.timetable=timetable }
        if let periods=PeriodSchedule.parse(settings["periods"]) { PeriodSchedule.current=periods }
        for key in MaterialsCache.defaults.dictionaryRepresentation().keys where key.hasPrefix("mat-list-v2-") || key.hasPrefix("mat-at-v2-") { MaterialsCache.defaults.removeObject(forKey:key) }
        for (key,value) in settings["materialLists"] as? [String:String] ?? [:] where key.hasPrefix("mat-list-v2-") { MaterialsCache.defaults.set(Data(base64Encoded:value),forKey:key) }
    }
    @MainActor static func recoverInterruptedRestore() throws {
        guard let transaction=try RestoreTransaction.load(journalURL:journalURL,base:dir,destinations:roots) else { return }
        let previousQueue=try JSONDecoder().decode([WriteQueue.Op].self,from:transaction.journal.previousQueue)
        guard let settings=try JSONSerialization.jsonObject(with:transaction.journal.previousSettings) as? [String:Any] else { throw CocoaError(.fileReadCorruptFile) }
        try transaction.undoFolders()
        try WriteQueue.engine.restoreRecords(previousQueue)
        applySettings(settings)
        try InkLocal.resetAfterRestore()
        try transaction.finish()
        ReplyDrafts.clearMemory()
    }
    @MainActor static func recoverOnLaunch() {
        do { try recoverInterruptedRestore() } catch { Report.log("중단된 백업 복원 — 전송을 중지했습니다",error,show:true) }
    }
    /// 주 1회 자동 백업; 쓰기 중이면 다음 실행 때 재시도한다.
    @MainActor static func autoIfDue() { if let last,Date().timeIntervalSince(last)<7*86400 { return };do { _=try make() } catch { Report.log("자동 백업",error) } }
}
