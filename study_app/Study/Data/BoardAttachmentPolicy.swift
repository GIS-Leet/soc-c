// 게시판 이미지의 인증 토큰은 고정 HTTPS 엔드포인트에만 전송함.
import Foundation

enum BoardAttachmentPolicy {
    enum Access: Equatable { case authenticated, publicLegacy, rejected }
    static func access(_ url: URL) -> Access {
        guard url.scheme == "https", url.user == nil, url.password == nil, url.port == nil || url.port == 443 else { return .rejected }
        if url.host == "us-central1-soc-c-qna.cloudfunctions.net", URLComponents(url:url,resolvingAgainstBaseURL:false)?.percentEncodedPath == "/boardAttachment" { return .authenticated }
        if url.host == "firebasestorage.googleapis.com", url.path.hasPrefix("/v0/b/soc-c-qna.firebasestorage.app/o/") { return .publicLegacy }
        return .rejected
    }
}
