// 음성 입력 — 마이크 버튼을 누르는 동안 한국어 받아쓰기(SFSpeechRecognizer). 관찰 기록·상담 메모처럼 수업 중 10초 입력용
import SwiftUI
import Speech
import AVFoundation

@MainActor
final class SpeechInput: ObservableObject {
    @Published var listening = false
    @Published var partial = ""
    @Published var error: String? = nil
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ko-KR"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    var onFinal: ((String) -> Void)?

    func start() async {
        guard !listening else { return }
        let auth = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
        guard auth == .authorized else { error = "설정 → Desk → 음성 인식을 허용해 주세요"; return }
        guard await AVAudioApplication.requestRecordPermission() else { error = "마이크 권한이 필요합니다"; return }
        guard let recognizer, recognizer.isAvailable else { error = "이 기기에서 음성 인식을 쓸 수 없습니다"; return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers); try session.setActive(true, options: .notifyOthersOnDeactivation)
            let req = SFSpeechAudioBufferRecognitionRequest(); req.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
            request = req
            let node = engine.inputNode; let fmt = node.outputFormat(forBus: 0)
            node.removeTap(onBus: 0)
            node.installTap(onBus: 0, bufferSize: 1024, format: fmt) { buf, _ in req.append(buf) }
            engine.prepare(); try engine.start()
            listening = true; partial = ""; error = nil
            task = recognizer.recognitionTask(with: req) { [weak self] r, e in
                Task { @MainActor in
                    guard let self else { return }
                    if let r { self.partial = r.bestTranscription.formattedString; if r.isFinal { self.finish(r.bestTranscription.formattedString) } }
                    if let e, self.listening { self.stop(); if (e as NSError).code != 216 && (e as NSError).code != 301 { self.error = e.localizedDescription } }
                }
            }
        } catch { self.error = error.localizedDescription; Report.shared.fail("음성 입력", error, show: false) }
    }
    func stop() {
        guard listening else { return }
        engine.stop(); engine.inputNode.removeTap(onBus: 0); request?.endAudio(); listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if !partial.isEmpty { finish(partial) }
    }
    private func finish(_ text: String) { let t = text.trimmingCharacters(in: .whitespaces); partial = ""; task?.cancel(); task = nil; request = nil; if !t.isEmpty { onFinal?(t) } }
}

/// 누르고 있는 동안 듣고, 떼면 텍스트에 붙는 버튼
struct MicButton: View {
    @Binding var text: String
    @StateObject private var speech = SpeechInput()
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: speech.listening ? "waveform.circle.fill" : "mic.circle.fill")
                .scaledFont(30).foregroundStyle(speech.listening ? DeskTheme.live : DeskTheme.accent).symbolEffect(.variableColor.iterative, isActive: speech.listening)
                .contentShape(Circle())
                .onLongPressGesture(minimumDuration: 0.15, maximumDistance: 40, perform: {}, onPressingChanged: { pressing in if pressing { Task { await speech.start() } } else { speech.stop() } })
                .accessibilityLabel(speech.listening ? "듣는 중, 놓으면 입력" : "누르고 말하기")
            if speech.listening { Text(speech.partial.isEmpty ? "듣는 중…" : speech.partial).scaledFont(11).foregroundStyle(.secondary).lineLimit(1).frame(maxWidth: 160) }
            if let e = speech.error { Text(e).scaledFont(10).foregroundStyle(DeskTheme.live).lineLimit(2).frame(maxWidth: 160) }
        }
        .onAppear { speech.onFinal = { t in text = text.isEmpty ? t : text + (text.hasSuffix(" ") ? "" : " ") + t } }
    }
}
