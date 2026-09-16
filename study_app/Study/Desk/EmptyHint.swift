// 빈 화면 안내 — 아이콘·제목·설명·시작 버튼. 데이터가 없을 때 "여기서 시작"을 알려 준다
import SwiftUI

struct EmptyHint: View {
    let icon: String; let title: String; var text: String? = nil; var action: (String, () -> Void)? = nil
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon).scaledFont(34, .light).foregroundStyle(.secondary).accessibilityHidden(true)
            Text(title).font(.headline)
            if let text { Text(text).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true) }
            if let a = action { Button(a.0, action: a.1).deskProminent().controlSize(.small).padding(.top, 4) }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 28).padding(.horizontal, 20)
        .accessibilityElement(children: .combine)
    }
}
