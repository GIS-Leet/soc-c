// Google 로그인(네이티브). 웹뷰 안의 Google 팝업은 Google이 막으므로, 여기서 토큰을 받아 웹에 넘긴다
import Foundation
import GoogleSignIn
import UIKit

enum Auth {
    static var clientID: String? {
        guard let url = Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"),
              let d = NSDictionary(contentsOf: url) else { return nil }
        return d["CLIENT_ID"] as? String
    }
    static func configure() {
        guard !TestRuntime.isTesting else { return }
        if let id = clientID { GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: id) }
        GIDSignIn.sharedInstance.restorePreviousSignIn { _, _ in }
    }
    struct NoConfig: LocalizedError { var errorDescription: String? { "GoogleService-Info.plist 가 앱에 없습니다." } }
    struct NoWindow: LocalizedError { var errorDescription: String? { "화면을 찾지 못했습니다." } }
    @MainActor
    static func signIn() async throws -> String? {
        try TestRuntime.requireLiveAccess()
        guard clientID != nil else { throw NoConfig() }
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let root = scene.keyWindow?.rootViewController else { throw NoWindow() }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: root)
        return result.user.profile?.email
    }
    /// 웹에 넘길 토큰 (없으면 nil)
    static func tokens() async -> (id: String, access: String)? {
        guard !TestRuntime.isTesting else { return nil }
        guard let user = GIDSignIn.sharedInstance.currentUser else { return nil }
        let refreshed = (try? await user.refreshTokensIfNeeded()) ?? user
        guard let id = refreshed.idToken?.tokenString else { return nil }
        return (id, refreshed.accessToken.tokenString)
    }
}
