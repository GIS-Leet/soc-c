// HTML 자료 → 쪽이 나뉜 PDF. 1차: 웹뷰 전체 내용을 벡터 PDF로 뽑아(createPDF) A4 비율로 잘라 쪽 만들기.
// 결과가 빈 종이면 2차: 화면에 보이게 스크롤하며 스냅샷(래스터)으로 쪽 만들기. 인쇄 포맷터는 기기에서 빈 페이지가 나와 쓰지 않음
import UIKit
import WebKit
import PDFKit

enum HTMLToPDF {
    static let pageWidth: CGFloat = 700          // 기본 웹뷰 폭(pt). 문서가 더 넓으면(A4 794px 학습지 등) 그 폭까지 넓힘
    static let maxWidth: CGFloat = 1200
    static func pageHeight(_ w: CGFloat) -> CGFloat { (w * 842 / 595).rounded() }   // A4 비율
    static let maxPages = 80

    @MainActor
    static func render(_ url: URL) async throws -> Data {
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight(pageWidth)))
        guard let host = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else { throw err("창을 찾지 못했습니다") }
        web.isUserInteractionEnabled = false; host.insertSubview(web, at: 0)   // 맨 뒤(화면 아래)에 두고 실제로 그리게 함 — alpha를 낮추면 스냅샷도 흐려짐
        defer { web.removeFromSuperview() }
        let loader = Loader(); web.navigationDelegate = loader
        if TestRuntime.isTesting { let html=(try? String(contentsOf:url,encoding:.utf8)) ?? "";web.loadHTMLString("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;\">"+html,baseURL:nil) }
        else { web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()) }
        try await loader.wait()
        _ = try? await web.callAsyncJavaScript("try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) {} return true;", arguments: [:], contentWorld: .page)
        try? await Task.sleep(for: .seconds(0.8))
        // 슬라이드 덱(수업자료: .stage 1280×720 + .slide 여러 장, 한 번에 한 장만 표시) → 장마다 찍어서 한 쪽씩
        let slides = (try? await web.evaluateJavaScript("document.querySelector('.stage') ? document.querySelectorAll('.slide').length : 0") as? Int) ?? 0
        if slides > 1 { return try await slideDeck(web, host: host, count: slides) }
        // 문서가 웹뷰보다 넓으면(가로 스크롤) 그 폭에 맞춤
        let docW = (try? await web.evaluateJavaScript("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)") as? Double) ?? 0
        let w = min(max(CGFloat(docW), pageWidth), maxWidth), ph = pageHeight(w)
        if w != pageWidth { web.frame.size.width = w; try? await Task.sleep(for: .seconds(0.4)) }
        let h1 = await height(web)
        var total = min(max(h1, ph), ph * CGFloat(maxPages))
        // 화면 높이(vh)에 따라 배치가 바뀌는 문서는 웹뷰를 키우면 모양이 달라짐 → 스냅샷 방식만
        web.frame.size.height = total; try? await Task.sleep(for: .seconds(0.4))
        let h2 = await height(web)
        if abs(h2 - h1) > h1 * 0.3 { web.frame.size.height = ph; try? await Task.sleep(for: .seconds(0.3)); return try await snapshots(web, width: w, total: min(max(h1, ph), ph * CGFloat(maxPages))) }
        total = min(max(h2, ph), ph * CGFloat(maxPages))
        // 1차: 벡터. 빈 종이거나 쪽수가 말이 안 되면 2차: 스냅샷
        if let data = try? await vector(web, width: w, total: total), !isBlank(data), let n = PDFDocument(data: data)?.pageCount, Double(n) >= floor(Double(total / ph)) { return data }
        return try await snapshots(web, width: w, total: total)
    }
    @MainActor
    private static func height(_ web: WKWebView) async -> CGFloat {
        CGFloat((try? await web.evaluateJavaScript("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)") as? Double) ?? 0)
    }
    /// 슬라이드 덱: 무대를 화면에 맞게 줄이고, 장마다 active 로 바꿔 가며 찍는다 (쪽 크기 1280×720)
    @MainActor
    private static func slideDeck(_ web: WKWebView, host: UIView, count: Int) async throws -> Data {
        let stage = CGSize(width: 1280, height: 720)
        web.frame = CGRect(origin: .zero, size: stage)   // 무대 원본 크기 그대로(덱 자체의 맞춤 배율이 1이 되게)
        _ = try? await web.evaluateJavaScript("""
            (function(){ document.querySelectorAll('.hint, .hud, .progress, .counter').forEach(function(e){ e.style.visibility = 'hidden'; }); window.dispatchEvent(new Event('resize')); return true; })()
            """)
        try? await Task.sleep(for: .seconds(0.4))
        var images: [UIImage] = []
        for i in 0..<min(count, 200) {
            _ = try? await web.evaluateJavaScript("(function(){ var s = document.querySelectorAll('.slide'); for (var j = 0; j < s.length; j++) { s[j].classList.toggle('active', j === \(i)); } return true; })()")
            try? await Task.sleep(for: .seconds(0.3))
            let cfg = WKSnapshotConfiguration(); cfg.rect = web.bounds; cfg.afterScreenUpdates = true
            images.append(try await web.takeSnapshot(configuration: cfg))
        }
        let bounds = CGRect(origin: .zero, size: stage)
        return UIGraphicsPDFRenderer(bounds: bounds).pdfData { ctx in for im in images { ctx.beginPage(); im.draw(in: bounds) } }
    }
    /// 웹뷰를 내용 높이만큼 키워 한 장짜리 PDF를 뽑고, A4 비율로 잘라 여러 쪽으로
    @MainActor
    private static func vector(_ web: WKWebView, width pageWidth: CGFloat, total: CGFloat) async throws -> Data {
        let pageHeight = pageHeight(pageWidth)
        web.frame.size.height = total
        try? await Task.sleep(for: .seconds(0.5))
        let cfg = WKPDFConfiguration(); cfg.rect = CGRect(x: 0, y: 0, width: pageWidth, height: total)
        let one = try await web.pdf(configuration: cfg)
        guard let doc = PDFDocument(data: one), let page = doc.page(at: 0) else { throw err("PDF 변환 실패") }
        let src = page.bounds(for: .mediaBox); let n = Int(ceil(src.height / pageHeight))
        let out = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
        return out.pdfData { ctx in
            for i in 0..<min(n, maxPages) {
                ctx.beginPage()
                let cg = ctx.cgContext; cg.saveGState()
                cg.setFillColor(UIColor.white.cgColor); cg.fill(CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
                // PDF 좌표는 아래가 원점: 잘라낼 조각이 쪽 위에 오도록 옮김
                cg.translateBy(x: 0, y: pageHeight); cg.scaleBy(x: 1, y: -1)
                cg.translateBy(x: 0, y: -(src.height - CGFloat(i + 1) * pageHeight))
                page.draw(with: .mediaBox, to: cg)
                cg.restoreGState()
            }
        }
    }
    /// 웹뷰를 쪽 높이로 두고 스크롤하며 찍기(항상 그려지는 영역만 찍으므로 빈 페이지가 없음)
    @MainActor
    private static func snapshots(_ web: WKWebView, width pageWidth: CGFloat, total: CGFloat) async throws -> Data {
        let pageHeight = pageHeight(pageWidth)
        web.frame.size.height = pageHeight
        let n = min(Int(ceil(total / pageHeight)), maxPages)
        var images: [UIImage] = []
        for i in 0..<n {
            web.scrollView.setContentOffset(CGPoint(x: 0, y: CGFloat(i) * pageHeight), animated: false)
            try? await Task.sleep(for: .seconds(0.35))
            let cfg = WKSnapshotConfiguration(); cfg.rect = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight); cfg.afterScreenUpdates = true
            images.append(try await web.takeSnapshot(configuration: cfg))
        }
        let bounds = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
        return UIGraphicsPDFRenderer(bounds: bounds).pdfData { ctx in for im in images { ctx.beginPage(); im.draw(in: bounds) } }
    }
    /// 첫 두 쪽이 거의 흰색이면 실패로 간주
    static func isBlank(_ data: Data) -> Bool {
        guard let doc = PDFDocument(data: data), doc.pageCount > 0 else { return true }
        for i in 0..<min(2, doc.pageCount) {
            guard let img = doc.page(at: i)?.thumbnail(of: CGSize(width: 120, height: 170), for: .mediaBox).cgImage, let d = img.dataProvider?.data as Data? else { continue }
            let bpp = img.bitsPerPixel / 8; var dark = 0, count = 0
            for p in stride(from: 0, to: d.count - bpp, by: bpp * 3) { count += 1; if d[p] < 200 || d[p + 1] < 200 || d[p + 2] < 200 { dark += 1 } }
            if count > 0 && Double(dark) / Double(count) > 0.002 { return false }
        }
        return true
    }
    static func err(_ m: String) -> NSError { NSError(domain: "HTMLToPDF", code: 1, userInfo: [NSLocalizedDescriptionKey: m]) }
    final class Loader: NSObject, WKNavigationDelegate {
        private var cont: CheckedContinuation<Void, Error>?
        func wait() async throws { try await withCheckedThrowingContinuation { cont = $0 } }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { cont?.resume(); cont = nil }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { cont?.resume(throwing: error); cont = nil }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { cont?.resume(throwing: error); cont = nil }
    }
}
