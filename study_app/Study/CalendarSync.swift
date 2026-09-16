// Apple 캘린더 연동(EventKit) — 고른 캘린더의 일정을 읽어 보여주고, desk 일정은 「Desk」 캘린더에 양방향 미러링
import Foundation
import EventKit
import SwiftUI

/// 다른 캘린더의 일정(읽기 전용 표시)
struct ExternalEvent: Identifiable, Equatable {
    let id: String; let title: String; let date: String; let minutes: Int?; let endMinutes: Int?; let calendar: String; let color: Color
    var deskText: String { CalendarPlan.text(title: title, minutes: minutes) }
}

@MainActor
final class CalendarModel: ObservableObject {
    static let shared = CalendarModel()
    let store = EKEventStore()
    @Published var authorized = false
    @Published var external: [String: [ExternalEvent]] = [:]   // 날짜 키 → 일정
    @Published var calendars: [EKCalendar] = []
    @Published var status = ""
    @Published var enabled: Bool = UserDefaults.standard.bool(forKey: "calEnabled") { didSet { UserDefaults.standard.set(enabled, forKey: "calEnabled") } }
    @Published var mirror: Bool = UserDefaults.standard.object(forKey: "calMirror") as? Bool ?? true { didSet { UserDefaults.standard.set(mirror, forKey: "calMirror") } }
    @Published var selected: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "calSelected") ?? []) { didSet { UserDefaults.standard.set(Array(selected), forKey: "calSelected") } }
    private var mirrored: Set<String> { get { Set(UserDefaults.standard.stringArray(forKey: "calMirrored") ?? []) } set { UserDefaults.standard.set(Array(newValue), forKey: "calMirrored") } }
    private var lastSync: Date { get { UserDefaults.standard.object(forKey: "calLastSync") as? Date ?? .distantPast } set { UserDefaults.standard.set(newValue, forKey: "calLastSync") } }
    private var syncing = false
    private var ownWrites: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: "calOwnWrites") as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: "calOwnWrites") }
    }
    private var eventIDs: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: "calEventIDs") as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: "calEventIDs") }
    }
    private let journal = CalendarJournal(url: TestRuntime.storage("calendar-journal.json") {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("calendar-journal.json")
    })

    init() {
        if TestRuntime.isTesting { return }
        authorized = EKEventStore.authorizationStatus(for: .event) == .fullAccess
        NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { [weak self] _ in Task { await self?.refresh() } }
    }
    func requestAccess() async {
        if TestRuntime.isTesting { return }
        do { authorized = try await store.requestFullAccessToEvents() } catch { authorized = false; status = error.localizedDescription }
        if authorized { enabled = true; loadCalendars(); if selected.isEmpty { selected = Set(calendars.filter { $0.title != "Desk" }.map(\.calendarIdentifier)) }; await refresh() }
    }
    func loadCalendars() { if TestRuntime.isTesting { return };calendars = store.calendars(for: .event).sorted { $0.title < $1.title } }

    /// 「Desk」 캘린더(없으면 생성). 기본 캘린더와 같은 계정(iCloud 등)에 만든다
    func deskCalendar() -> EKCalendar? {
        if TestRuntime.isTesting { return nil }
        if let id = UserDefaults.standard.string(forKey: "calDeskID"), let c = store.calendar(withIdentifier: id) { return c }
        if let c = store.calendars(for: .event).first(where: { $0.title == "Desk" }) { UserDefaults.standard.set(c.calendarIdentifier, forKey: "calDeskID"); return c }
        let c = EKCalendar(for: .event, eventStore: store); c.title = "Desk"; c.cgColor = UIColor(DeskTheme.accent).cgColor
        guard let src = store.defaultCalendarForNewEvents?.source ?? store.sources.first(where: { $0.sourceType == .calDAV }) ?? store.sources.first(where: { $0.sourceType == .local }) else { return nil }
        c.source = src
        do { try store.saveCalendar(c, commit: true); UserDefaults.standard.set(c.calendarIdentifier, forKey: "calDeskID"); return c } catch { status = "Desk 캘린더 생성 실패: \(error.localizedDescription)"; return nil }
    }

    /// 읽기(다른 캘린더 표시) + 미러링(양방향)
    func refresh(desk: DeskStore? = nil) async {
        if TestRuntime.isTesting { return }
        authorized = EKEventStore.authorizationStatus(for: .event) == .fullAccess
        guard enabled, authorized else { return }
        if calendars.isEmpty { loadCalendars() }
        let deskCal = mirror ? deskCalendar() : nil
        readExternal(excluding: deskCal)
        if let deskCal, let desk = desk ?? Optional(DeskStore.shared), desk.ready { await sync(desk: desk, cal: deskCal) }
    }
    /// Apple 캘린더 일정만 다시 읽기(배경 갱신·알림용)
    func reloadExternal() { guard enabled, authorized else { return }; if calendars.isEmpty { loadCalendars() }; readExternal(excluding: mirror ? deskCalendar() : nil) }
    private func readExternal(excluding deskCal: EKCalendar?) {
        let from = Calendar.current.startOfDay(for: Date()).addingTimeInterval(-86400)
        external = collect(from: from, to: from.addingTimeInterval(86400 * 40), excluding: deskCal)
    }
    /// 달력 화면용 — 보이는 기간의 Apple 캘린더 일정(Desk 미러 캘린더 제외). 연동·권한이 꺼져 있으면 빈 값
    func externalEvents(from: Date, to: Date) -> [String: [ExternalEvent]] {
        guard enabled, authorized else { return [:] }
        if calendars.isEmpty { loadCalendars() }
        return collect(from: from, to: to, excluding: mirror ? deskCalendar() : nil)
    }
    private func collect(from: Date, to: Date, excluding deskCal: EKCalendar?) -> [String: [ExternalEvent]] {
        let cal = Calendar.current
        let cals = store.calendars(for: .event).filter { selected.contains($0.calendarIdentifier) && $0.calendarIdentifier != deskCal?.calendarIdentifier }
        guard !cals.isEmpty else { return [:] }
        let events = store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: cals))
        var out: [String: [ExternalEvent]] = [:]
        for e in events {
            guard let start = e.startDate else { continue }
            let end = e.endDate ?? start
            var d = cal.startOfDay(for: start); let last = e.isAllDay ? end.addingTimeInterval(-1) : end
            while d <= last {   // 여러 날 일정은 날마다
                let k = FB.key(d)
                let mins = e.isAllDay || !cal.isDate(d, inSameDayAs: start) ? nil : Timetable.minutes(start)
                out[k, default: []].append(ExternalEvent(id: e.eventIdentifier + "|" + k, title: e.title ?? "", date: k, minutes: mins, endMinutes: mins.map { _ in Timetable.minutes(end) }, calendar: e.calendar.title, color: Color(cgColor: e.calendar.cgColor)))
                d = cal.date(byAdding: .day, value: 1, to: d)!
            }
        }
        return out.mapValues { $0.sorted { ($0.minutes ?? -1, $0.title) < ($1.minutes ?? -1, $1.title) } }
    }
    private func sync(desk: DeskStore, cal: EKCalendar) async {
        guard !syncing, desk.receivedPaths.contains("desk/calendar"), desk.streamErrors["desk/calendar"] == nil,
              EKEventStore.authorizationStatus(for: .event) == .fullAccess else { status = "전체 일정 수신과 캘린더 권한을 확인하는 중"; return }
        syncing = true; defer { syncing = false }
        let now = Date(), calendar = Calendar.current
        let from = calendar.date(byAdding: .day, value: -60, to: calendar.startOfDay(for: now))!
        let to = calendar.date(byAdding: .day, value: 401, to: calendar.startOfDay(for: now))!
        let window = FB.key(from)...FB.key(to.addingTimeInterval(-1))
        func events() -> [EKEvent] { store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: [cal])) }
        func resume() async throws {
            try await journal.resume(remote: { operation in
                guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { throw CocoaError(.fileReadNoPermission) }
                if !operation.patch.isEmpty { try await RTDB.patch("desk/calendar", operation.patch) }
            }, local: { operation in
                guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { throw CocoaError(.fileReadNoPermission) }
                var mapping = self.eventIDs, mirrored = self.mirrored
                if operation.kind == "deleteEK" {
                    if let id = operation.eventID, let event = self.store.event(withIdentifier: id) { try self.store.remove(event, span: .thisEvent, commit: true) }
                } else if operation.kind != "deleteDesk", let destination = operation.destination {
                    let existing = operation.eventID.flatMap { self.store.event(withIdentifier: $0) }
                        ?? mapping[destination.key].flatMap { self.store.event(withIdentifier: $0) }
                        ?? events().first { $0.notes == "desk:" + destination.key }
                    guard existing != nil || operation.kind == "createEK" else { throw CocoaError(.fileNoSuchFile) }
                    let event = existing ?? EKEvent(eventStore: self.store)
                    if CalendarPlan.rewritesEvent(operation.kind) { event.calendar = cal; self.apply(destination, to: event) }
                    else { event.notes = "desk:" + destination.key }
                     try self.store.save(event, span: .thisEvent, commit: true)
                    mapping[destination.key] = event.eventIdentifier; mirrored.insert(destination.key)
                    var own = self.ownWrites; own[event.eventIdentifier] = FB.key(event.startDate ?? Date()) + "\n" + CalendarPlan.text(title: event.title ?? "", minutes: event.isAllDay ? nil : Timetable.minutes(event.startDate ?? Date())); self.ownWrites = own
                }
                if let source = operation.source, source.key != operation.destination?.key { mapping.removeValue(forKey: source.key); mirrored.remove(source.key) }
                self.eventIDs = mapping; self.mirrored = mirrored
            })
        }
        do {
            // 중단된 작업을 먼저 마친 뒤 최신 서버 원본으로 다음 diff를 만든다.
            try await resume()
            let server = JSONTree.asDict(try await RTDB.get("desk/calendar"))
            let deskItems = server.flatMap { date, value in JSONTree.asDict(value).compactMap { id, raw -> CalendarPlan.DeskItem? in
                guard let text = JSONTree.asDict(raw)["text"] as? String else { return nil }
                return .init(date: date, id: id, text: text)
            } }
            guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { throw CocoaError(.fileReadNoPermission) }
            var ekEvents = events(), absent = Set<String>()
            var mapping = eventIDs
            for event in ekEvents { if let tag = event.notes, tag.hasPrefix("desk:") { mapping[String(tag.dropFirst(5))] = event.eventIdentifier } }
            eventIDs = mapping
            let visibleIDs = Set(ekEvents.compactMap(\.eventIdentifier))
            for item in deskItems where window.contains(item.date) && mirrored.contains(item.key) {
                guard let id = mapping[item.key], !visibleIDs.contains(id) else { continue }
                if let moved = store.event(withIdentifier: id) { ekEvents.append(moved) } else { absent.insert(item.key) }
            }
            let ek = ekEvents.map { e in CalendarPlan.EKItem(ekID: e.eventIdentifier, tag: e.notes.flatMap { $0.hasPrefix("desk:") ? String($0.dropFirst(5)) : nil }, title: e.title ?? "", date: FB.key(e.startDate ?? now), minutes: e.isAllDay ? nil : Timetable.minutes(e.startDate ?? now), modified: e.lastModifiedDate ?? .distantPast) }
            guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { throw CocoaError(.fileReadNoPermission) }
            let plan = CalendarPlan.plan(desk: deskItems, ek: ek, mirrored: mirrored, lastSync: lastSync, window: window, verifiedAbsent: absent, ownWrites: ownWrites)
            var operations: [CalendarJournal.Operation] = []
            for d in plan.createEK { operations.append(.init(id: UUID().uuidString, kind: "createEK", eventID: nil, source: nil, destination: d)) }
            for (e, d) in plan.updateEK { operations.append(.init(id: UUID().uuidString, kind: "updateEK", eventID: e.ekID, source: d, destination: d)) }
            for e in plan.deleteEK {
                let key = (e.tag ?? "").split(separator: "/").map(String.init)
                guard key.count == 2 else { continue }
                operations.append(.init(id: UUID().uuidString, kind: "deleteEK", eventID: e.ekID, source: .init(date: key[0], id: key[1], text: ""), destination: nil))
            }
            for e in plan.createDesk { operations.append(.init(id: UUID().uuidString, kind: "import", eventID: e.ekID, source: nil, destination: .init(date: e.date, id: RTDB.pushKey(), text: e.deskText))) }
            for (d, e) in plan.updateDesk { operations.append(.init(id: UUID().uuidString, kind: d.date == e.date ? "updateDesk" : "move", eventID: e.ekID, source: d, destination: .init(date: e.date, id: d.id, text: e.deskText))) }
            for d in plan.deleteDesk { operations.append(.init(id: UUID().uuidString, kind: "deleteDesk", eventID: nil, source: d, destination: nil)) }
            for operation in operations {
                guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { throw CocoaError(.fileReadNoPermission) }
                try journal.append(operation); try await resume()
            }
            lastSync = Date()
            status = operations.isEmpty ? "동기화됨 · 변경 없음" : "동기화됨 · \(operations.count)건 반영"
        } catch { store.reset(); status = "동기화 대기 · \(error.localizedDescription)" }
    }
    private func apply(_ d: CalendarPlan.DeskItem, to e: EKEvent) {
        e.title = CalendarPlan.title(of: d.text); e.notes = "desk:\(d.key)"
        let day = FB.day.date(from: d.date) ?? Date()
        if let m = TimelineLayout.minutes(in: d.text) {
            e.isAllDay = false; e.startDate = Calendar.current.date(bySettingHour: m / 60, minute: m % 60, second: 0, of: day); e.endDate = e.startDate.addingTimeInterval(3600)
        } else { e.isAllDay = true; e.startDate = Calendar.current.startOfDay(for: day); e.endDate = Calendar.current.date(byAdding: .day, value: 1, to: e.startDate) }
    }
}
