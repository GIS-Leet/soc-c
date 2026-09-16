// 홈페이지 페이지(desk.html·study.html)를 띄우는 공용 웹뷰 — 네이티브 Google 토큰 주입, 앱으로 오는 메시지, 외부 링크는 Safari로
import SwiftUI
import WebKit

struct BridgeWebView: UIViewRepresentable {
    let url: URL
    var reload: Int = 0   // 값이 바뀌면 다시 로드
    var onMessage: ([String: Any]) -> Void = { _ in }

    func makeCoordinator() -> Coordinator { Coordinator(onMessage: onMessage) }
    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()   // 로그인 유지, Desk·공부 화면이 공유
        cfg.allowsInlineMediaPlayback = true
        cfg.userContentController.add(context.coordinator, name: "study")
        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.navigationDelegate = context.coordinator
        wv.uiDelegate = context.coordinator
        wv.allowsBackForwardNavigationGestures = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.webView = wv
        Self.freshLoad(wv, url)
        return wv
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        if context.coordinator.reload != reload { context.coordinator.reload = reload; Self.freshLoad(uiView, url) }
    }
    /// 캐시된 스크립트·데이터가 남지 않게 HTTP 캐시만 비우고 로드(쿠키·localStorage 는 유지 → 로그인 유지)
    static func freshLoad(_ wv: WKWebView, _ url: URL) {
        if TestRuntime.isTesting { wv.loadHTMLString("<p>격리된 공부 화면</p>",baseURL:nil);return }
        guard BridgeTrust.allows(url) else { return }
        let types: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
        WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast) { wv.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)) }
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let onMessage: ([String: Any]) -> Void
        weak var webView: WKWebView?
        var reload = 0
        var navigationRevision = 0
        init(onMessage: @escaping ([String: Any]) -> Void) { self.onMessage = onMessage }
        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
            let origin = message.frameInfo.securityOrigin
            guard BridgeTrust.allowsMessage(mainFrame:message.frameInfo.isMainFrame,scheme:origin.protocol,host:origin.host,port:origin.port,url:message.frameInfo.request.url),BridgeTrust.allows(webView?.url),let body=message.body as? [String:Any] else { return }
            if body["needSignIn"] as? Bool == true { Task { await inject() }; return }
            onMessage(body)
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { Task { await inject() } }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { navigationRevision += 1 }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard action.targetFrame?.isMainFrame != false else { decisionHandler(.allow);return }
            if BridgeTrust.allows(action.request.url) { decisionHandler(.allow) }
            else { decisionHandler(.cancel);if let url=action.request.url,["https","http"].contains(url.scheme) { UIApplication.shared.open(url) } }
        }
        // target=_blank·window.open → Safari
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let u = navigationAction.request.url,["https","http"].contains(u.scheme) { UIApplication.shared.open(u) }
            return nil
        }
        /// 네이티브 토큰을 웹에 넘김. 없으면 로그인 창을 띄운 뒤 넘김
        @MainActor func inject() async {
            guard let wv=webView,let original=wv.url,BridgeTrust.allows(original) else { return }
            let revision=navigationRevision
            var t = await Auth.tokens()
            if t == nil { _ = try? await Auth.signIn(); t = await Auth.tokens() }
            guard let t,revision == navigationRevision,wv.url == original,BridgeTrust.allows(wv.url) else { return }
            _ = try? await wv.evaluateJavaScript("window.nativeSignIn && window.nativeSignIn(\(Self.q(t.id)), \(Self.q(t.access)));")
        }
        static func q(_ s: String) -> String { String(data:try! JSONSerialization.data(withJSONObject:s,options:[.fragmentsAllowed]),encoding:.utf8)! }
    }
}
