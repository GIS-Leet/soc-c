// 발표 — (1) 외부 화면(AirPlay·HDMI)이 붙으면 그 화면엔 페이지와 필기만 띄우고 iPad엔 도구를 남김
//        (2) 「발표 모드」: iPad 화면 자체에서 도구 막대·상단 바를 숨김 (미러링만 쓸 때)
import SwiftUI
import PencilKit
import UIKit

@MainActor
final class PresentationState: ObservableObject {
    static let shared = PresentationState()
    @Published var background: UIImage? = nil
    @Published var suspended = false
    private(set) var owner: UUID?
    func begin(_ owner: UUID) { self.owner=owner;active=false;background=nil;ink.drawing=PKDrawing();ink.laser=[] }
    func owns(_ owner: UUID) -> Bool { self.owner == owner }
    @Published var pageSize: CGSize = InkCodec.pageSize
    @Published var active = false          // 필기 화면이 열려 있음
    @Published var hideChrome = false       // 발표 모드(도구 숨김)
    @Published var externalConnected = false
    @Published var paperColor: UIColor = .white
    /// 획·레이저는 자주 바뀌므로 따로 둔다 — 필기 화면은 이걸 관찰하지 않아 획마다 다시 그리지 않음(외부 화면 뷰만 관찰)
    let ink = PresentationInk()
    var drawing: PKDrawing { ink.drawing }
    func show(background: UIImage?, size: CGSize, drawing: PKDrawing, paper: UIColor = .white, owner: UUID) { guard owns(owner) else { return }; self.background = background; pageSize = size; ink.drawing = drawing; paperColor = paper; active = true }
    func update(drawing: PKDrawing, owner: UUID) { if owns(owner), externalConnected { ink.drawing = drawing } }
    func clear(owner: UUID) { guard owns(owner) else { return };self.owner=nil;active = false; hideChrome = false; background = nil; ink.drawing = PKDrawing(); ink.laser = [] }
}
@MainActor
final class PresentationInk: ObservableObject {
    @Published var drawing = PKDrawing()
    @Published var laser: [LaserPoint] = []
}

/// 외부 화면에 그리는 뷰 — 검은 바탕에 페이지를 비율 맞춰 채움. 필기가 바뀌면 바로 반영
struct PresentationView: View {
    @ObservedObject var p = PresentationState.shared
    @ObservedObject var ink = PresentationState.shared.ink
    var body: some View {
        GeometryReader { g in
            ZStack {
                Color.black
                if p.active && !p.suspended {
                    let k = min(g.size.width / p.pageSize.width, g.size.height / p.pageSize.height)
                    ZStack {
                        if let bg = p.background { Image(uiImage: bg).resizable() } else { Color(p.paperColor) }
                        ReadOnlyCanvas(drawing: ink.drawing)
                        LaserTrail(points: ink.laser, scale: k)
                    }
                    .frame(width: p.pageSize.width * k, height: p.pageSize.height * k)
                } else {
                    VStack(spacing: 10) {
                        Text("Desk").desk(.number(44)).foregroundStyle(.white.opacity(0.9))
                        Text("HTML 자료나 필기 화면을 열면 여기에 표시됩니다").scaledFont(18).foregroundStyle(.white.opacity(0.5))
                    }
                }
            }
        }
        .ignoresSafeArea()
    }
}

/// 읽기 전용 캔버스(외부 화면용) — 페이지 좌표의 잉크를 화면 크기에 맞춰 축소
struct ReadOnlyCanvas: UIViewRepresentable {
    let drawing: PKDrawing
    func makeUIView(context: Context) -> PKCanvasView {
        let v = PKCanvasView(); v.isUserInteractionEnabled = false; v.backgroundColor = .clear; v.isOpaque = false
        v.isScrollEnabled = false; v.drawingPolicy = .pencilOnly; return v
    }
    func updateUIView(_ v: PKCanvasView, context: Context) {
        let p = PresentationState.shared
        let k = v.bounds.width > 0 ? v.bounds.width / p.pageSize.width : 1
        v.drawing = drawing.transformed(using: CGAffineTransform(scaleX: k, y: k))
    }
}

/// 외부 화면 씬 — AppDelegate 가 외부 디스플레이 역할에 이 델리게이트를 붙임
final class ExternalSceneDelegate: NSObject, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.rootViewController = UIHostingController(rootView: PresentationView())
        w.isHidden = false; window = w
        Task { @MainActor in PresentationState.shared.externalConnected = true }
    }
    func sceneDidDisconnect(_ scene: UIScene) { Task { @MainActor in PresentationState.shared.externalConnected = false } }
}

/// 발표 모드 나가기 — 작고 반투명, 왼쪽 아래
struct PresentationExitButton: View {
    var body: some View {
        Button { PresentationState.shared.hideChrome = false } label: {
            Image(systemName: "xmark").desk(.label).foregroundStyle(.white).frame(width: 26, height: 26).background(Color.black.opacity(0.25), in: Circle())
        }.buttonStyle(.plain).padding(10).accessibilityLabel("발표 모드 종료")
    }
}
