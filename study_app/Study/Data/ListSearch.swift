// 한글 정규화 검색과 홈페이지 명단 교체 차이를 계산함.
import Foundation

enum ListSearch {
    static func matches(_ query: String, fields: [String]) -> Bool {
        let terms=query.precomposedStringWithCanonicalMapping.lowercased().split(whereSeparator:\.isWhitespace)
        let value=fields.joined(separator:" ").precomposedStringWithCanonicalMapping.lowercased()
        return terms.allSatisfy { value.contains($0) }
    }
}
struct RosterChange {
    let added: [RosterLine.Entry];let kept: [RosterLine.Entry];let removed: [RosterEntry];let invalidLines: [Int];let duplicateIDs: [String]
    init(existing: [RosterEntry], text:String) {
        let next=RosterLine.parse(text),previous=Set(existing.map(\.h)),hashes=Set(next.map { RosterHash.h(sid:$0.sid,name:$0.name) })
        added=next.filter { !previous.contains(RosterHash.h(sid:$0.sid,name:$0.name)) };kept=next.filter { previous.contains(RosterHash.h(sid:$0.sid,name:$0.name)) };removed=existing.filter { !hashes.contains($0.h) }
        var invalid:[Int]=[],seen=Set<String>(),duplicates=Set<String>()
        for (index,line) in text.components(separatedBy:.newlines).enumerated() where !line.trimmingCharacters(in:.whitespaces).isEmpty {
            guard let entry=RosterLine.parse(line).first else { invalid.append(index+1);continue }
            if !seen.insert(entry.sid).inserted { duplicates.insert(entry.sid) }
        }
        invalidLines=invalid;duplicateIDs=duplicates.sorted()
    }
}
