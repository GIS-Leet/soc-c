// 네이티브 토큰·메시지 전달을 허용한 교사 페이지와 주 프레임으로 제한함.
import Foundation

enum BridgeTrust {
    static func allows(_ url: URL?) -> Bool {
        guard let url,url.scheme == "https",url.host == "nyuheatgis.com",url.user == nil,url.password == nil,url.port == nil || url.port == 443 else { return false }
        return ["/desk.html","/study.html"].contains(URLComponents(url:url,resolvingAgainstBaseURL:false)?.percentEncodedPath ?? "")
    }
    static func allowsMessage(mainFrame: Bool, scheme: String, host: String, port: Int, url: URL?) -> Bool {
        mainFrame && scheme == "https" && host == "nyuheatgis.com" && [0,443].contains(port) && allows(url)
    }
}
