// 「상담」 — 암호구절로 잠금 해제 → 학생 목록 → 학생 메모·상담/관찰 기록 (전부 암호화 저장, PC와 호환)
import SwiftUI
import CryptoKit
import PhotosUI

@MainActor final class ClassSession: ObservableObject {
    @Published var key: SymmetricKey? = nil
    var left: Date? = nil
    /// 앱이 뒤로 가면 시각 기록, 5분 넘게 있다 오면 다시 잠금
    func phase(_ p: ScenePhase) { if p == .background { left = Date() } else if p == .active, let l = left { left = nil; if Date().timeIntervalSince(l) > 300 { key = nil } } }
}

struct ClassView: View {
    var initialClassName: String? = nil
    @EnvironmentObject var store: DeskStore
    @Environment(\.scenePhase) private var phase
    @StateObject private var session = ClassSession()
    var body: some View {
        Group {
            if let key = session.key { StudentListView(key: key, session: session, initialClassName: initialClassName) } else { ClassLockView(session: session) }
        }
        .navigationTitle("상담")
            .onChange(of: phase) { _, p in session.phase(p) }
    }
}

struct ClassLockView: View {
    @EnvironmentObject var store: DeskStore
    @ObservedObject var session: ClassSession
    @State private var pass = ""; @State private var pass2 = ""; @State private var warn: String?; @State private var busy = false
    @State private var remember = true
    var isNew: Bool { store.classMetadataState == .absent }
    var hasSaved: Bool { Keychain.exists("class-pass") }
    var body: some View {
        Form {
            if store.classMetadataState == .loading { ProgressView("기존 암호 설정 확인 중") }
            if store.classMetadataState == .failed { Text("암호 설정을 읽지 못했습니다. 연결 또는 데이터 오류를 확인해 주세요.").foregroundStyle(.red) }
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: "lock.shield").scaledFont(34).foregroundStyle(DeskTheme.accent)
                    Text(isNew ? "상담 기록 암호 설정" : "상담 기록 잠금 해제").font(.title3.bold())
                    Text(isNew ? "처음 사용합니다. 학생 기록을 암호화할 암호구절을 정해 주세요." : "학생 기록은 암호구절로 암호화되어 저장됩니다. 서버에는 암호문만 있고, 암호구절은 어디에도 저장되지 않습니다.").font(.footnote).foregroundStyle(.secondary)
                }.padding(.vertical, 6)
            }
            if hasSaved && !isNew {
                Section { Button { Task { await unlockWithFaceID() } } label: { Label("Face ID로 해제", systemImage: "faceid") }.disabled(busy) }
            }
            Section {
                SecureField("암호구절", text: $pass).textContentType(.password)
                if isNew { SecureField("암호구절 확인", text: $pass2) }
                Toggle("이 기기에서 Face ID로 기억", isOn: $remember)
            } footer: { if let w = warn { Text(w).foregroundStyle(DeskTheme.live) } else { Text("암호구절은 Face ID로만 열리는 이 기기의 보안 저장소에 보관되고, 서버로는 가지 않습니다.").font(.footnote) } }
            Section { Button(isNew ? "설정하고 시작" : "잠금 해제") { Task { await unlock() } }.disabled(pass.count < 4 || busy || store.classMetadataState == .loading || store.classMetadataState == .failed) }
        }
    }
    func unlock() async {
        warn = nil; busy = true; defer { busy = false }
        if pass.count < 4 { warn = "암호구절은 4자 이상이어야 합니다."; return }
        do {
            if isNew { if pass != pass2 { warn = "두 입력이 서로 다릅니다."; return }; session.key = try await store.setupClass(pass) }
            else { session.key = try store.unlockClass(pass) }
            if remember { _ = Keychain.setBiometric(pass, for: "class-pass") } else { Keychain.delete("class-pass") }
        } catch { warn = error.localizedDescription }
    }
    func unlockWithFaceID() async {
        warn = nil; busy = true; defer { busy = false }
        guard let saved = await Task.detached(operation: { Keychain.getBiometric("class-pass", reason: "상담 기록 잠금 해제") }).value else { warn = "Face ID 확인이 취소되었거나 저장된 암호구절이 없습니다."; return }
        do { session.key = try store.unlockClass(saved) } catch { warn = "저장된 암호구절이 더 이상 맞지 않습니다. 직접 입력해 주세요."; Keychain.delete("class-pass") }
    }
}

struct StudentListView: View {
    @EnvironmentObject var store: DeskStore
    let key: SymmetricKey
    @ObservedObject var session: ClassSession
    var initialClassName: String? = nil
    @State private var num = ""; @State private var name = ""
    @State private var openID: String?
    var students: [Student] { store.students(key: key) }
    var body: some View {
        List {
            if let initialClassName { Section { Label(initialClassName + " 수업에서 열었습니다", systemImage: "person.3") } }
            if store.unreadableStudents(key: key) > 0 { Text("읽을 수 없는 학생 기록 \(store.unreadableStudents(key: key))건 · 원본은 보존되어 있습니다.").foregroundStyle(.red) }
            Section {
                HStack { TextField("번호", text: $num).keyboardType(.numberPad).frame(width: 56); TextField("이름", text: $name)
                    Button("추가") { Task { if let s = await store.newStudent(num: num.trimmingCharacters(in: .whitespaces), name: name.trimmingCharacters(in: .whitespaces), key: key) { num = ""; name = ""; openID = s.id } } }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty) }
            }
            Section {
                if students.isEmpty { EmptyHint(icon: "person.text.rectangle", title: "학생이 없습니다", text: "번호와 이름으로 추가하면 상담 기록·좌석표·출결을 여기서 관리합니다. 모든 내용은 암호구절로 잠겨 저장됩니다.") }
                ForEach(students) { s in
                    NavigationLink(value: s.id) {
                        HStack { Text(s.num.isEmpty ? "–" : s.num).scaledFont(14, .semibold, mono: true).foregroundStyle(.secondary).frame(width: 28, alignment: .leading)
                            Text(s.name).scaledFont(16, .medium); Spacer(); Text("기록 \(s.logs.count)건").font(.caption).foregroundStyle(.secondary) }
                    }
                    .swipeActions(edge: .trailing) { Button(role: .destructive) { store.deleteStudent(s) } label: { Label("삭제", systemImage: "trash") } }
                }
            } header: { Text("학생 \(students.count)명") }
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: String.self) { id in
            if id == "seating" { SeatChartListView(key: key, initialClassName: initialClassName) }
            else if id.hasPrefix("chart:") { SeatChartView(chartID: String(id.dropFirst(6)), key: key) }
            else { StudentDetailView(studentID: id, key: key) }
        }
        .navigationDestination(item: $openID) { id in StudentDetailView(studentID: id, key: key) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { NavigationLink(value: "seating") { Label("좌석표", systemImage: "rectangle.grid.3x2") } }
            ToolbarItem(placement: .topBarTrailing) { Button("잠금") { session.key = nil } }
        }
    }
}

struct StudentDetailView: View {
    let studentID: String; let key: SymmetricKey
    @EnvironmentObject var store: DeskStore
    @State private var baseline = ""; @State private var savingNote = false; @State private var logID = UUID().uuidString; @State private var submittedLog: StudentLog?; @State private var submittedPhotos: [Data] = []
    @State private var note = ""; @State private var loaded = false; @State private var saveTask: Task<Void, Never>?
    @State private var logText = ""; @State private var logTag = "상담"; @State private var logDate = Date()
    @State private var picked: [PhotosPickerItem] = []; @State private var pendingPhotos: [Data] = []; @State private var uploading = false
    static let tags = ["상담", "관찰", "학습", "생활", "기타"]
    var student: Student? { store.students(key: key).first { $0.id == studentID } }
    var body: some View {
        Group {
            if let s = student {
                List {
                    let att = SeatChart.summary(store.charts(key: key), student: s.id)
                    if !att.isEmpty { Section("출결") { Text(SeatChart.summaryText(att)).scaledFont(15, .medium).foregroundStyle(DeskTheme.live) } }
                    Section("메모") {
                        TextEditor(text: $note).frame(minHeight: 80).onChange(of: note) { _, v in if loaded { schedule(s, v) } }
                        if note != baseline { Button(savingNote ? "저장 중…" : "메모 저장 · 초안은 이 기기에 보관") { Task { await saveNote() } }.disabled(savingNote) }
                    }
                    Section("기록 추가") {
                        Picker("종류", selection: $logTag) { ForEach(Self.tags, id: \.self) { Text($0) } }.pickerStyle(.segmented)
                        DatePicker("날짜", selection: $logDate, displayedComponents: .date)
                        HStack(alignment: .top) { TextField("내용", text: $logText, axis: .vertical).lineLimit(2...6); MicButton(text: $logText) }
                        HStack {
                            PhotosPicker(selection: $picked, maxSelectionCount: 4, matching: .images) { Label(pendingPhotos.isEmpty ? "사진" : "사진 \(pendingPhotos.count)장", systemImage: "photo") }
                                .onChange(of: picked) { _, items in Task { pendingPhotos = []; for it in items { if let d = try? await it.loadTransferable(type: Data.self), let j = Self.jpeg(d) { pendingPhotos.append(j) } } } }
                            Spacer()
                            Button(uploading ? "저장 중…" : "기록 추가") { Task { await addLog(s) } }
                                .disabled((submittedLog == nil && logText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && pendingPhotos.isEmpty) || uploading)
                        }
                    }
                    Section("기록 \(s.logs.count)건") {
                        ForEach(s.logs.sorted { $0.date > $1.date }, id: \.recordID) { l in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack { Text(l.tag).font(.caption.weight(.semibold)).foregroundStyle(l.tag == "상담" ? DeskTheme.accent : .secondary); Text(l.date).font(.caption).foregroundStyle(.secondary) }
                                if !l.text.isEmpty { Text(l.text).desk(.body) }
                                if !l.photos.isEmpty { ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) { ForEach(l.photos, id: \.self) { pid in EncryptedPhoto(id: pid, key: key) } } } }
                            }
                            .swipeActions(edge: .trailing) { Button(role: .destructive) { Task { await store.editStudent(s.id, .deleteLog(l.recordID), key: key) } } label: { Label("삭제", systemImage: "trash") } }
                        }
                    }
                }
                .navigationTitle("\(s.num.isEmpty ? "" : s.num + "번 ")\(s.name)").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { NavigationLink { StudentDossierView(student: s, key: key) } label: { Label("세특 자료", systemImage: "doc.text.magnifyingglass") } } }
                .onAppear { if !loaded { let draft = ClassDrafts.read(studentID, key: key); note = draft?.note ?? s.note; baseline = draft?.baseline ?? s.note; loaded = true } }
                .onDisappear { if note != baseline && !savingNote { Task { await saveNote() } } }
            } else { ContentUnavailableView("삭제된 학생", systemImage: "person.slash") }
        }
    }
    func addLog(_ s: Student) async {
        uploading = true; defer { uploading = false }
        if submittedLog == nil {
            let text = logText.trimmingCharacters(in: .whitespacesAndNewlines), date = FB.key(logDate), tag = logTag, photos = pendingPhotos
            var ids: [String] = []
            for jpeg in photos { guard let id = await store.savePhoto(jpeg, key: key) else { return }; ids.append(id) }
            submittedPhotos = photos
            submittedLog = StudentLog(id: s.logs.count, date: date, text: text, tag: tag, photos: ids, recordID: logID)
        }
        guard let submittedLog else { return }
        if await store.editStudent(studentID, .appendLog(submittedLog), key: key) {
            if logText.trimmingCharacters(in: .whitespacesAndNewlines) == submittedLog.text { logText = "" }
            if pendingPhotos == submittedPhotos { pendingPhotos = []; picked = [] }
            self.submittedLog = nil; submittedPhotos = []; logID = UUID().uuidString
        }
    }

    /// 최대 1280px · 품질 0.6 JPEG (암호화해 DB에 넣으므로 작게)
    static func jpeg(_ data: Data) -> Data? {
        guard let img = UIImage(data: data) else { return nil }
        let maxSide: CGFloat = 1280, scale = min(1, maxSide / max(img.size.width, img.size.height))
        let size = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        let r = UIGraphicsImageRenderer(size: size); let out = r.image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        return out.jpegData(compressionQuality: 0.6)
    }
    func schedule(_ s: Student, _ value: String) {
        do { try ClassDrafts.save(studentID, note: value, baseline: baseline, key: key) }
        catch { store.error = "초안 보관 실패: \(error.localizedDescription)" }
    }
    func saveNote() async {
        guard !savingNote, note != baseline else { return }
        savingNote = true; defer { savingNote = false }
        let value = note
        if await store.editStudent(studentID, .setNote(value, baseline: baseline), key: key) {
            baseline = value
            if note != value {
                do { try ClassDrafts.save(studentID, note: note, baseline: value, key: key) }
                catch { store.error = "후속 초안 보관 실패: \(error.localizedDescription)" }
            }
        }
    }
}


/// 암호화된 사진 — 내려받아 복호화해 표시, 탭하면 크게
struct EncryptedPhoto: View {
    let id: String; let key: SymmetricKey
    @EnvironmentObject var store: DeskStore
    @State private var image: UIImage?
    @State private var full = false
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFill().frame(width: 96, height: 96).clipShape(RoundedRectangle(cornerRadius: 10)).onTapGesture { full = true } }
            else { RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.06)).frame(width: 96, height: 96).overlay(ProgressView()) }
        }
        .task { if image == nil, let d = await store.loadPhoto(id, key: key) { image = UIImage(data: d) } }
        .fullScreenCover(isPresented: $full) { if let image { ZStack { Color.black.ignoresSafeArea(); Image(uiImage: image).resizable().scaledToFit() }.onTapGesture { full = false } } }
    }
}
