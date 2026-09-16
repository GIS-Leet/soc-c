// 수업 녹음 — 필기 화면에서 녹음하면 페이지를 넘길 때마다 시각을 표시해 두고, 재생할 때 그 쪽으로 따라감. 파일은 필기 키 폴더(Application Support/ink/{key}/audio)에만(서버 미전송)
import SwiftUI
import AVFoundation

@MainActor
final class InkRecorder: NSObject, ObservableObject, AVAudioPlayerDelegate {
    struct Recording: Identifiable, Codable, Equatable { var id: String; var at: Double; var seconds: Double; var marks: [Mark]
        struct Mark: Codable, Equatable { var t: Double; var page: Int } }
    @Published var recording = false
    @Published var elapsed: Double = 0
    @Published var playing: Recording? = nil
    @Published var position: Double = 0
    @Published var recordings: [Recording] = []
    @Published var follow = true
    var onPage: ((Int) -> Void)?
    private var recorder: AVAudioRecorder?; private var player: AVAudioPlayer?
    private var current: Recording?; private var timer: Timer?; private var lastPage = 0
    let key: String
    init(key: String) { self.key = key; super.init(); recordings = Self.load(key) }
    static func dir(_ key: String) -> URL { let u = InkLocal.folder(key).appendingPathComponent("audio", isDirectory: true); try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true); return u }
    static func load(_ key: String) -> [Recording] { (try? Data(contentsOf: dir(key).appendingPathComponent("index.json"))).flatMap { try? JSONDecoder().decode([Recording].self, from: $0) } ?? [] }
    private func save() { try? JSONEncoder().encode(recordings).write(to: Self.dir(key).appendingPathComponent("index.json"), options: .atomic) }
    func url(_ r: Recording) -> URL { Self.dir(key).appendingPathComponent(r.id + ".m4a") }

    func start(page: Int) async {
        guard !recording else { return }
        guard await AVAudioApplication.requestRecordPermission() else { Report.shared.fail("녹음", message: "마이크 권한이 필요합니다"); return }
        do {
            let s = AVAudioSession.sharedInstance(); try s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth]); try s.setActive(true)
            let id = String(Int(Date().timeIntervalSince1970)); let u = Self.dir(key).appendingPathComponent(id + ".m4a")
            let rec = try AVAudioRecorder(url: u, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 22050, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue])
            rec.record(); recorder = rec; recording = true; elapsed = 0; lastPage = page
            current = Recording(id: id, at: Date().timeIntervalSince1970, seconds: 0, marks: [.init(t: 0, page: page)])
            timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in Task { @MainActor in guard let self else { return }; if self.recording { self.elapsed = self.recorder?.currentTime ?? 0 } else if let p = self.player, p.isPlaying { self.position = p.currentTime; self.followPage(p.currentTime) } } }
        } catch { Report.shared.fail("녹음", error) }
    }
    func mark(page: Int) { guard recording, page != lastPage, let t = recorder?.currentTime else { return }; lastPage = page; current?.marks.append(.init(t: t, page: page)) }
    func stop() {
        guard recording, let rec = recorder else { return }
        rec.stop(); recording = false
        if var c = current { c.seconds = rec.currentTime > 0 ? rec.currentTime : elapsed; recordings.insert(c, at: 0); save() }
        current = nil; recorder = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    func play(_ r: Recording) {
        stopPlayback()
        do { try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default); try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: url(r)); p.delegate = self; p.play(); player = p; playing = r; position = 0
            timer?.invalidate(); timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in Task { @MainActor in guard let self, let p = self.player else { return }; self.position = p.currentTime; self.followPage(p.currentTime) } }
        } catch { Report.shared.fail("재생", error) }
    }
    func seek(_ t: Double) { player?.currentTime = t; position = t; followPage(t) }
    func togglePause() { guard let p = player else { return }; if p.isPlaying { p.pause() } else { p.play() } }
    var isPaused: Bool { !(player?.isPlaying ?? false) }
    func stopPlayback() { player?.stop(); player = nil; playing = nil; position = 0 }
    func delete(_ r: Recording) { if playing?.id == r.id { stopPlayback() }; try? FileManager.default.removeItem(at: url(r)); recordings.removeAll { $0.id == r.id }; save() }
    private func followPage(_ t: Double) { guard follow, let r = playing, let m = r.marks.last(where: { $0.t <= t }) else { return }; if m.page != lastPage { lastPage = m.page; onPage?(m.page) } }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { Task { @MainActor in self.stopPlayback() } }
    static func fmt(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
}

/// 녹음 중/재생 중 떠 있는 작은 막대
struct RecordingBar: View {
    @ObservedObject var rec: InkRecorder
    var body: some View {
        Group {
            if rec.recording {
                HStack(spacing: 8) { Circle().fill(DeskTheme.live).frame(width: 8, height: 8).opacity(Int(rec.elapsed * 2) % 2 == 0 ? 1 : 0.3); Text("녹음 " + InkRecorder.fmt(rec.elapsed)).scaledFont(12, .semibold, mono: true); Button("정지") { rec.stop() }.desk(.label) }
            } else if let r = rec.playing {
                HStack(spacing: 8) {
                    Button { rec.togglePause() } label: { Image(systemName: rec.isPaused ? "play.fill" : "pause.fill") }.accessibilityLabel(rec.isPaused ? "재생" : "일시정지")
                    Slider(value: Binding(get: { rec.position }, set: { rec.seek($0) }), in: 0...max(1, r.seconds)).frame(width: 160)
                    Text(InkRecorder.fmt(rec.position) + " / " + InkRecorder.fmt(r.seconds)).scaledFont(11, mono: true).foregroundStyle(.secondary)
                    Toggle("쪽 따라가기", isOn: $rec.follow).toggleStyle(.button).scaledFont(11)
                    Button { rec.stopPlayback() } label: { Image(systemName: "xmark") }.accessibilityLabel("재생 끝")
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 7).background(.regularMaterial, in: Capsule()).shadow(color: .black.opacity(0.1), radius: 4, y: 2)
    }
}

/// 녹음 목록
struct RecordingsSheet: View {
    @ObservedObject var rec: InkRecorder
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                if rec.recordings.isEmpty { EmptyHint(icon: "waveform", title: "녹음이 없습니다", text: "메뉴에서 「수업 녹음 시작」을 누르면 이 자료에 녹음이 붙고, 페이지를 넘긴 시각이 표시돼 재생할 때 그 쪽으로 따라갑니다.") }
                ForEach(rec.recordings) { r in
                    Button { rec.play(r); dismiss() } label: {
                        HStack { VStack(alignment: .leading, spacing: 2) { Text(Date(timeIntervalSince1970: r.at).formatted(date: .abbreviated, time: .shortened)).desk(.bodyStrong); Text(InkRecorder.fmt(r.seconds) + " · 쪽 표시 \(r.marks.count)개").scaledFont(12).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "play.circle").scaledFont(22).foregroundStyle(DeskTheme.accent) }
                    }.foregroundStyle(.primary)
                    .swipeActions { Button(role: .destructive) { rec.delete(r) } label: { Label("삭제", systemImage: "trash") } }
                }
            }
            .navigationTitle("수업 녹음").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
        }.presentationDetents([.medium, .large])
    }
}
