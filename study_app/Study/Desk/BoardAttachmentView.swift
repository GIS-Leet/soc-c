// 비공개 첨부를 인증 헤더로 읽고 계정 변경 시 표시·메모리를 폐기함.
import SwiftUI

struct BoardAttachmentView: View {
    let url: URL
    @State private var image: UIImage?
    @State private var message: String?
    @State private var reload = UUID()
    var body: some View {
        Group {
            if let image { Image(uiImage:image).resizable().scaledToFit().accessibilityLabel("게시판 첨부 이미지") }
            else if let message { VStack(alignment:.leading,spacing:8) { Text(message).font(.caption).foregroundStyle(.secondary);Button("이미지 다시 열기") { reload=UUID() } } }
            else { ProgressView("이미지 불러오는 중") }
        }
        .task(id: "\(url.absoluteString)-\(reload)") { await load() }
        .onReceive(NotificationCenter.default.publisher(for:Notification.Name("DeskFirebaseSessionChanged"))) { _ in image=nil;message=nil;reload=UUID() }
    }
    @MainActor private func load() async {
        image=nil;message=nil
        let revision=await FirebaseSession.shared.sessionRevision
        let access=BoardAttachmentPolicy.access(url)
        guard access != .rejected else { message="지원하지 않는 첨부 주소입니다.";return }
        do {
            var request=URLRequest(url:url,cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:30)
            if access == .authenticated { request.setValue("Bearer \(try await FirebaseSession.shared.token())",forHTTPHeaderField:"Authorization") }
            guard !Task.isCancelled,revision == (await FirebaseSession.shared.sessionRevision) else { return }
            let configuration=URLSessionConfiguration.ephemeral;configuration.urlCache=nil
            let session=URLSession(configuration:configuration,delegate:NoAttachmentRedirect(),delegateQueue:nil)
            defer { session.invalidateAndCancel() }
            let (data,response)=try await session.data(for:request)
            guard !Task.isCancelled,revision == (await FirebaseSession.shared.sessionRevision) else { return }
            guard let http=response as? HTTPURLResponse,(200..<300).contains(http.statusCode) else { throw AttachmentError.unavailable }
            guard let type=http.mimeType,type.hasPrefix("image/"),data.count<=10*1024*1024,let decoded=UIImage(data:data) else { throw AttachmentError.unavailable }
            image=decoded
        } catch {
            guard !Task.isCancelled,revision == (await FirebaseSession.shared.sessionRevision) else { return }
            message="첨부를 열지 못했습니다. 로그인 상태와 연결을 확인해 주세요."
        }
    }
    private enum AttachmentError: Error { case unavailable }
}
private final class NoAttachmentRedirect: NSObject,URLSessionTaskDelegate {
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping (URLRequest?)->Void) { completionHandler(nil) }
}
