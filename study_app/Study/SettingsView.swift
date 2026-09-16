// 설정 탭 — 권한, Face ID 잠금, 수업 알림, 시간표 상태
import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject var m: AppModel
    @EnvironmentObject var cal: CalendarModel
    @EnvironmentObject var store: DeskStore
    @ObservedObject private var report = Report.shared
    @AppStorage("onboarded") private var onboarded = false
    @State private var showOnboarding = false
    @State private var backupMsg = ""
    @State private var importingBackup=false
    @State private var restoreCandidate: BackupArchive?
    @State private var restoring=false
    @State private var eventAlarm = TimetableStore.eventAlarmOn
    var body: some View {
            List {
                Section("Apple 캘린더") {
                    if !cal.authorized {
                        Button("캘린더 연동 켜기") { Task { await cal.requestAccess() } }
                        Text("고른 캘린더의 일정을 「오늘」에 함께 보여주고, desk 일정은 「Desk」 캘린더에 넣어 Mac·Watch에서도 보이게 합니다.").font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Toggle("연동", isOn: $cal.enabled).onChange(of: cal.enabled) { _, _ in Task { await cal.refresh() } }
                        Toggle("desk 일정을 Desk 캘린더에 미러링", isOn: $cal.mirror).onChange(of: cal.mirror) { _, _ in Task { await cal.refresh() } }
                        ForEach(cal.calendars.filter { $0.title != "Desk" }, id: \.calendarIdentifier) { c in
                            Button { if cal.selected.contains(c.calendarIdentifier) { cal.selected.remove(c.calendarIdentifier) } else { cal.selected.insert(c.calendarIdentifier) }; Task { await cal.refresh() } } label: {
                                HStack { Circle().fill(Color(cgColor: c.cgColor)).frame(width: 10, height: 10); Text(c.title).foregroundStyle(.primary); Spacer(); if cal.selected.contains(c.calendarIdentifier) { Image(systemName: "checkmark").foregroundStyle(DeskTheme.accent) } }
                            }
                        }
                        Button("지금 동기화") { Task { await cal.refresh() } }
                        if !cal.status.isEmpty { Text(cal.status).font(.footnote).foregroundStyle(.secondary) }
                    }
                }
                Section("권한") {
                    #if !targetEnvironment(macCatalyst)
                    row("Screen Time(앱 잠금)", ok: m.screenTimeAuthorized) { Task { await m.requestScreenTime() } }
                    #endif
                    row("알림", ok: m.notificationsAuthorized) { Task { await m.requestNotifications() } }
                    HStack { Text("Google"); Spacer()
                        if let e = m.signedInEmail { Text(e).foregroundStyle(.secondary).font(.footnote) } else { Button("로그인") { Task { await m.signIn() } } } }
                }
                Section("잠금") {
                    Toggle("Face ID로 앱 잠금", isOn: $m.faceID).onChange(of: m.faceID) { _, v in TimetableStore.faceIDOn = v }
                    Text("앱이 앞으로 올 때마다 Face ID(또는 암호)를 확인합니다.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("수업 알림") {
                    Toggle("수업 2분 전 알림", isOn: $m.classAlarm).onChange(of: m.classAlarm) { _, v in TimetableStore.classAlarmOn = v; ClassAlarm.schedule() }
                    HStack { Text("시간표"); Spacer()
                        Text(m.timetableAt.map { "갱신 " + $0.formatted(date: .abbreviated, time: .shortened) } ?? "아직 없음").foregroundStyle(.secondary).font(.footnote) }
                    NavigationLink("교시 시간 (1교시 \(Timetable.hhmm(1)) · \(Timetable.periodLength)분)") { PeriodEditor() }
                    Button("시간표 새로고침") { Task { await ClassAlarm.refresh(); m.refresh() } }
                    Text("desk 시간표를 받아 앞으로 5일치 수업마다 시작 2분 전에 무음 배너를 띄웁니다. 홈 화면 위젯도 같은 시간표를 씁니다.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("일정 알림") {
                    Toggle("아침 7시 요약 · 일정 10분 전", isOn: $eventAlarm).onChange(of: eventAlarm) { _, v in TimetableStore.eventAlarmOn = v; EventAlarm.schedule() }
                    Text("desk 일정과 연동한 Apple 캘린더 일정을 앱 알림으로 보냅니다(디스코드 알림 대체). 홈 화면 「일정」 위젯도 같은 목록을 씁니다.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("백업") {
                    HStack { Text("마지막 백업"); Spacer(); Text(Backup.last.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "없음").foregroundStyle(.secondary).font(.footnote) }
                    Button("지금 백업") { do { _ = try Backup.make(); backupMsg = "저장됨 · Files 앱 › Desk › Backups" } catch { Report.shared.fail("백업", error) } }
                    if let u = Backup.files.first { ShareLink(item: u) { Label("최근 백업 공유", systemImage: "square.and.arrow.up") } }
                    Button("백업 파일 검증·복원…") { importingBackup=true }
                    Text(backupMsg.isEmpty ? "기기에 받은 노트·일정·상담 암호문·필기·녹음·자료 파일·대기 작업을 체크섬과 함께 보관합니다. 인증 토큰과 원격 전용 파일은 제외합니다. 복원 전 현재 상태를 별도 백업하며 과거 백업은 자동 삭제하지 않습니다." : backupMsg).font(.footnote).foregroundStyle(.secondary)
                }
                Section("정보") {
                    let info = Bundle.main.infoDictionary ?? [:]
                    let build = Bundle.main.url(forResource: "BuildInfo", withExtension: "plist").flatMap { NSDictionary(contentsOf: $0) as? [String: String] } ?? [:]
                    HStack { Text("버전"); Spacer(); Text("\(info["CFBundleShortVersionString"] ?? "") (\(info["CFBundleVersion"] ?? ""))").foregroundStyle(.secondary).font(.footnote.monospacedDigit()) }
                    HStack { Text("빌드"); Spacer(); Text("\(build["commit"] ?? "-") · \(build["date"] ?? "-")").foregroundStyle(.secondary).font(.footnote.monospacedDigit()) }
                    if let u = Bundle.main.url(forResource: "CHANGELOG", withExtension: "txt"), let t = try? String(contentsOf: u, encoding: .utf8) { NavigationLink("변경 사항") { ScrollView { Text(t).font(.footnote.monospaced()).frame(maxWidth: .infinity, alignment: .leading).padding() }.navigationTitle("변경 사항") } }
                    Button("처음 안내 다시 보기") { onboarded = false; showOnboarding = true }
                }
                Section("동기화") {
                    HStack { Text("보내지 못한 변경"); Spacer(); Text(store.pending == 0 ? "없음" : "\(store.pending)개").foregroundStyle(store.pending == 0 ? .secondary : DeskTheme.warn) }
                    NavigationLink("대기·실패 파일 (\(store.pendingUploads)개)") { UploadQueueView() }
                    if store.pending > 0 || store.pendingUploads > 0 { Button("지금 보내기") { Task { await store.drainQueue(retryFailures:true) } } }
                    Text("노트·할 일·일정·답변은 기기에 먼저 저장되고 순서대로 서버에 보냅니다. 기기 저장에 실패하면 오류를 표시합니다. 마지막 데이터는 기기에 남아 앱을 열자마자 보입니다.").font(.footnote).foregroundStyle(.secondary)
                    Button("기기 캐시 비우기") { DeskStore.clearCache() }.foregroundStyle(.secondary)
                }
                Section("최근 오류") {
                    if report.entries.isEmpty { Text("기록된 오류 없음").font(.footnote).foregroundStyle(.secondary) }
                    ForEach(report.entries.prefix(30)) { e in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack { Text(e.ctx).font(.subheadline.weight(.semibold)).foregroundStyle(e.kind == "error" ? DeskTheme.live : e.kind == "crash" ? DeskTheme.live : .primary); Spacer(); Text(e.date.formatted(date: .numeric, time: .shortened)).font(.caption2).foregroundStyle(.secondary) }
                            Text(e.msg).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                        }
                    }
                    if !report.entries.isEmpty { ShareLink(item: report.text, subject: Text("Desk 문제 신고")) { Label("문제 신고 (기록 공유)", systemImage: "square.and.arrow.up") }; Button("기록 지우기", role: .destructive) { report.clear() } }
                }
                Section("필기 성능 기록") {
                    let sm = InkPerf.summary()
                    if sm.isEmpty { Text("아직 기록 없음 — 필기 화면을 쓰면 쌓입니다").font(.footnote).foregroundStyle(.secondary) }
                    ForEach(sm, id: \.label) { r in HStack { Text(InkPerf.names[r.label] ?? r.label); Spacer(); Text(String(format: "p50 %.0f · p95 %.0f · 최대 %.0f ms · %d회", r.p50,r.p95,r.max,r.n)).font(.footnote.monospacedDigit()).foregroundStyle(r.avg > (InkPerf.target[r.label] ?? 120) ? DeskTheme.warn : .secondary) } }
                    if !sm.isEmpty { Button("기록 복사") { UIPasteboard.general.string = sm.map { "\(InkPerf.names[$0.label] ?? $0.label): p50 \(Int($0.p50))ms p95 \(Int($0.p95))ms max \(Int($0.max))ms n=\($0.n)" }.joined(separator: "\n") }; Button("기록 지우기", role: .destructive) { InkPerf.clear() } }
                }
                if !m.message.isEmpty { Section { Text(m.message).foregroundStyle(DeskTheme.live).font(.footnote) } }
            }
            .navigationTitle("설정")
            .fileImporter(isPresented:$importingBackup,allowedContentTypes:[.json]) { result in
                guard case .success(let url)=result,url.startAccessingSecurityScopedResource() else { return };defer {url.stopAccessingSecurityScopedResource()}
                do { restoreCandidate=try Backup.read(url) } catch { backupMsg=error.localizedDescription }
            }
            .sheet(isPresented:Binding(get:{restoreCandidate != nil},set:{if !$0 {restoreCandidate=nil}})) {
                NavigationStack { Form {
                    if let archive=restoreCandidate {
                        Section("검증한 백업") { Text(Date(timeIntervalSince1970:archive.createdAt).formatted());Text("파일 \(archive.entries.count)개 · \(ByteCountFormatter.string(fromByteCount:Int64(archive.entries.reduce(0){$0+$1.size}),countStyle:.file))") }
                        Section("적용 범위") { Text("기기의 해당 자료와 대기 작업을 복원합니다. 재연결 시 서버의 최신 스냅샷을 다시 읽으며, 복원된 대기 작업은 서버 전송 대상입니다.");ForEach(archive.excluded,id:\.self) { Text("제외: "+$0).font(.footnote) } }
                        if !backupMsg.isEmpty { Text(backupMsg).font(.footnote) }
                        Button(restoring ? "복원 중…" : "현재 상태 백업 후 복원") { restoring=true;Task {
                            store.stop()
                            do { let previous=try Backup.restore(archive);store.reloadRestoredCache();backupMsg="복원 완료 · 직전 상태: "+previous.lastPathComponent;restoreCandidate=nil }
                            catch { backupMsg="복원 실패: "+error.localizedDescription }
                            await store.start();restoring=false
                        } }.disabled(restoring)
                    }
                }.navigationTitle("복원 미리보기").toolbar { ToolbarItem(placement:.cancellationAction) { Button("취소") { restoreCandidate=nil }.disabled(restoring) } } }.interactiveDismissDisabled(restoring)
            }
            .fullScreenCover(isPresented: $showOnboarding) { OnboardingView().environmentObject(m).environmentObject(cal).environmentObject(store) }
    }
    private func row(_ title: String, ok: Bool, action: @escaping () -> Void) -> some View {
        HStack { Text(title); Spacer(); if ok { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) } else { Button("허용", action: action) } }
    }
}
