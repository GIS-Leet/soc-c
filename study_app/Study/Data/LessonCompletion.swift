// 수업 종료는 고정된 차시와 영속 사건 ID로 처리해 중복 증가와 늦은 진도 회귀를 막는다.
import Foundation
import CryptoKit

enum LessonCompletion {
    static func payload(_ context: LessonContext) -> [String: Any]? {
        guard let classID=context.classID,let lesson=context.lessonNo,lesson>0 else { return nil }
        let identity="\(FB.key(context.date))/\(context.period ?? 0)/\(classID)/\(lesson)"
        let id=SHA256.hash(data:Data(identity.utf8)).map { String(format:"%02x",$0) }.joined()
        return ["id":id,"target":lesson,"at":Date().timeIntervalSince1970*1000,"date":FB.key(context.date),"period":context.period ?? 0,"lesson":lesson]
    }
    static func applying(_ value: [String:Any], to current: Any?) -> [String:Any] {
        var result=current as? [String:Any] ?? [:]
        let target=value["target"] as? Int ?? 0
        result["done"]=max(result["done"] as? Int ?? 0,target)
        var receipts=result["completedLessons"] as? [String:Any] ?? [:]
        if let id=value["id"] as? String,receipts[id]==nil { receipts[id]=value }
        result["completedLessons"]=receipts;return result
    }
    static func commit(_ path: String, _ value: [String:Any]) async throws {
        for _ in 0..<8 {
            let current=try await RTDB.getWithETag(path)
            guard let classData=current.value as? [String:Any],classData["name"] != nil else { throw NSError(domain:"desk.lesson",code:404,userInfo:[NSLocalizedDescriptionKey:"삭제된 반의 진도는 변경할 수 없습니다."]) }
            if try await RTDB.putIfMatch(path,applying(value,to:classData),etag:current.etag) { return }
        }
        throw NSError(domain:"desk.lesson",code:409,userInfo:[NSLocalizedDescriptionKey:"다른 기기의 진도 변경과 충돌했습니다. 작업을 보관하고 다시 시도합니다."])
    }
    static func enqueue(_ context: LessonContext) throws {
        guard let classID=context.classID,let value=payload(context) else { throw NSError(domain:"desk.lesson",code:400,userInfo:[NSLocalizedDescriptionKey:"반과 차시를 먼저 확인해 주세요."]) }
        _=try WriteQueue.enqueue("lessonComplete","progress/classes/"+classID,value).get()
    }
}
