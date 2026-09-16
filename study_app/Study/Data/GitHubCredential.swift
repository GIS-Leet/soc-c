// GitHub 자격은 기기 Keychain에 보관하고 일반 캐시·백업에서는 제외함.
import Foundation

enum GitHubCredential {
    static func read(_ snapshot: Any?) -> GitHubFiles? {
        guard let data=snapshot as? [String:Any],let repo=data["repo"] as? String,!repo.isEmpty else { return nil }
        let key="github-token-"+repo
        if let token=data["token"] as? String,!token.isEmpty { Keychain.set(token,for:key) }
        guard let token=Keychain.get(key),!token.isEmpty else { return nil }
        return GitHubFiles(token:token,repo:repo)
    }
    static func safeSnapshot(_ value: Any) -> Any {
        if let values=value as? [String:Any] {
            let forbidden:Set<String>=["token","accesstoken","idtoken","refreshtoken","api_key","apikey","clientsecret","private_key","password"]
            return values.reduce(into:[String:Any]()){ result,pair in
                let field=String(pair.key.split(separator:"/").last ?? Substring(pair.key)).lowercased()
                if !forbidden.contains(field.replacingOccurrences(of:"_",with:"")) && !forbidden.contains(field) { result[pair.key]=safeSnapshot(pair.value) }
            }
        }
        if let values=value as? [Any] { return values.map(safeSnapshot) }
        return value
    }
}
