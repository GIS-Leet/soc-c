// 업로드 대기의 목적지와 실패 이유를 항목별로 확인하고 선택한 파일만 재시도한다.
import SwiftUI

struct UploadQueueView: View {
    @EnvironmentObject var store: DeskStore
    @State private var items: [UploadQueue.Item] = []
    @State private var message: String?
    @State private var busy = false
    @State private var legacy: UploadQueue.Item?
    var body: some View {
        List {
            if items.isEmpty { Text("대기 파일이 없습니다").foregroundStyle(.secondary) }
            ForEach(items) { item in
                VStack(alignment:.leading,spacing:6) {
                    Text(item.name).font(.headline)
                    Text((item.repo ?? "구형 작업 · 저장소 확인 필요")+" / "+item.folder).font(.caption).foregroundStyle(.secondary)
                    if let failure=item.failure { Text(failure).font(.footnote).foregroundStyle(DeskTheme.live) }
                    if item.repo == nil { Button("현재 저장소로 연결…") { legacy=item }.disabled(store.github == nil || busy) }
                    else if item.repo == store.github?.repo { Button("이 파일 재시도") { Task { await retry(item) } }.disabled(busy) }
                    else { Text("원래 저장소를 연결하면 재시도할 수 있습니다").font(.footnote).foregroundStyle(.secondary) }
                }
            }
            if let message { Text(message).font(.footnote).foregroundStyle(DeskTheme.live) }
        }
        .navigationTitle("대기 파일")
        .task { reload() }
        .refreshable { reload() }
        .confirmationDialog("이전 대기 파일의 목적지를 확인하세요",isPresented:Binding(get:{legacy != nil},set:{if !$0 {legacy=nil}}),titleVisibility:.visible) {
            Button("현재 저장소 \(store.github?.repo ?? "")에 연결") { if let item=legacy { Task { await bind(item) } };legacy=nil }
        } message: { Text("파일 내용을 덮어쓰기 전 원본 SHA를 확인합니다. 충돌이 나면 원본을 보존하며 자동 덮어쓰기하지 않습니다.") }
    }
    func reload() { do { items=try UploadQueue.engine.items();message=nil;store.pendingUploads=items.count } catch { message="대기열을 읽지 못했습니다. 원본 파일은 보존됩니다: "+error.localizedDescription } }
    func retry(_ item: UploadQueue.Item) async {
        guard let gh=store.github,item.repo == gh.repo else { return };guard !UploadQueue.draining else { message="전송 중입니다. 잠시 뒤 다시 시도해 주세요.";return };busy=true;defer {busy=false}
        do {
            try await UploadQueue.retry(item,gh:gh);reload()
        } catch { try? UploadQueue.engine.markFailure(item.id,error.localizedDescription,blocked:true);reload();message=error.localizedDescription }
    }
    func bind(_ item: UploadQueue.Item) async {
        guard let gh=store.github else { return };busy=true;defer {busy=false}
        do { let list=try await gh.list(item.folder);try UploadQueue.engine.bindLegacy(item.id,repo:gh.repo,sourceSHA:list.first(where:{$0.name == item.name})?.sha);reload() }
        catch { message=error.localizedDescription }
    }
}
