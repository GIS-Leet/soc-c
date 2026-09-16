// 카드 서재 화면 — 과목별 전체 카드 목록(검색·오늘·읽음 표시)과 한 장 전체 읽기(자세한 설명·용어·예문·대화). 넓은 화면(Mac·iPad)은 목록+본문 두 칸, ←→ 로 넘김
import SwiftUI

struct LibRoute: Identifiable, Hashable { let id = UUID(); let random: Bool }

struct CardLibraryView: View {
    @State private var decks: [CardDeck] = []
    @State private var subject: String
    @State private var selectedID: String?
    @State private var pushed: LibCard?
    @State private var query = ""
    @State private var reads = CardReads.all()
    @State private var loaded = false
    @State private var wide = false
    let startDay: Int?
    let startRandom: Bool
    init(subject: String = "지리", day: Int? = nil, random: Bool = false) { _subject = State(initialValue: subject); startDay = day; startRandom = random }
    var now: Date { TodayView.testNow ?? Date() }
    var deck: CardDeck? { decks.first { $0.subject == subject } }
    var filtered: [LibCard] {
        guard let d = deck else { return [] }
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? d.cards : d.cards.filter { $0.matches(q) }
    }

    var body: some View {
        GeometryReader { geo in
            Group {
                if geo.size.width >= 760 {
                    HStack(spacing: 0) { list.frame(width: 340); Divider(); detailPane }
                } else { list }
            }
            .onAppear { wide = geo.size.width >= 760 }
            .onChange(of: geo.size.width) { _, w in wide = w >= 760 }
        }
        .background(DeskTheme.canvas)
        .navigationTitle("카드 서재")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "제목·내용 검색")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { randomCard() } label: { Label("아무 카드", systemImage: "shuffle") } } }
        .navigationDestination(item: $pushed) { c in CardPager(start: c, decks: decks) { reads.insert($0) } }
        .task {
            guard !loaded else { return }
            decks = await CardLibrary.load(); loaded = true
            if !decks.contains(where: { $0.subject == subject }), let f = decks.first { subject = f.subject }
            open()
        }
    }

    func open() {
        if startRandom { randomCard(); return }
        guard let d = deck else { return }
        if let day = startDay, day >= 1, day <= d.cards.count { show(d.cards[day - 1]); return }
        if wide, let i = d.todayIndex(now) { selectedID = d.cards[i].id }
    }
    func show(_ c: LibCard) { subject = c.subject; if wide { selectedID = c.id } else { pushed = c } }
    func randomCard() { if let c = CardLibrary.pick(decks, now: now, read: reads) { show(c) } }

    var list: some View {
        VStack(spacing: 0) {
            if !decks.isEmpty {
                Picker("과목", selection: $subject) { ForEach(decks.map(\.subject), id: \.self) { Text($0) } }
                    .pickerStyle(.segmented).padding(.horizontal, 12).padding(.top, 10)
            }
            if let d = deck {
                let readCount = d.cards.filter { reads.contains($0.id) }.count
                HStack {
                    Text("읽은 카드 \(readCount)/\(d.cards.count)").scaledFont(12, .semibold, mono: true).foregroundStyle(.secondary)
                    Spacer()
                    if let i = d.todayIndex(now) { Text("오늘 Day \(i + 1)").scaledFont(12, .semibold, mono: true).foregroundStyle(DeskTheme.accent) }
                }
                .padding(.horizontal, 16).padding(.vertical, 8)
            }
            if !loaded { ProgressView().frame(maxHeight: .infinity) }
            else if decks.isEmpty { Text("카드를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.").desk(.body).foregroundStyle(.secondary).padding().frame(maxHeight: .infinity) }
            else {
                ScrollViewReader { proxy in
                    List(filtered) { c in row(c).id(c.id) }
                        .listStyle(.plain).scrollContentBackground(.hidden)
                        .onAppear { scrollToCurrent(proxy) }
                        .onChange(of: subject) { _, _ in scrollToCurrent(proxy) }
                }
            }
        }
    }
    func scrollToCurrent(_ proxy: ScrollViewProxy) {
        guard let d = deck else { return }
        let target = selectedID.flatMap { id in d.cards.first { $0.id == id } } ?? d.todayIndex(now).map { d.cards[$0] }
        if let t = target { DispatchQueue.main.async { proxy.scrollTo(t.id, anchor: .center) } }
    }
    func row(_ c: LibCard) -> some View {
        let today = deck?.todayIndex(now) == c.index, read = reads.contains(c.id)
        let future = (deck?.elapsed(now) ?? 0) < c.index
        return Button { if wide { selectedID = c.id } else { pushed = c } } label: {
            HStack(spacing: 10) {
                Text("\(c.day)").scaledFont(13, .semibold, mono: true).foregroundStyle(.secondary).frame(width: 34, alignment: .trailing)
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.title).scaledFont(15, .semibold).foregroundStyle(.primary).lineLimit(1)
                    if !c.subtitle.isEmpty { Text(c.subtitle).desk(.small).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer(minLength: 4)
                if today { Text("오늘").scaledFont(11, .bold).foregroundStyle(DeskTheme.live) }
                else if read { Image(systemName: "checkmark.circle.fill").foregroundStyle(DeskTheme.success) }
                else if future { Text("예정").scaledFont(11, .semibold).foregroundStyle(.tertiary) }
            }
            .padding(.vertical, 3)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(wide && selectedID == c.id ? DeskTheme.accent.opacity(0.12) : Color.clear)
    }
    @ViewBuilder var detailPane: some View {
        if let d = deck, let id = selectedID, let c = d.cards.first(where: { $0.id == id }) {
            CardReader(card: c, deck: d, now: now, go: { selectedID = $0.id }, onRead: { reads.insert($0) })
        } else {
            VStack(spacing: 8) {
                Image(systemName: "books.vertical").font(.largeTitle).foregroundStyle(.tertiary)
                Text("왼쪽에서 카드를 고르거나 「아무 카드」를 눌러 보세요").desk(.body).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// 좁은 화면: 한 장 화면(이전·다음으로 같은 과목 안에서 넘김)
struct CardPager: View {
    @State private var card: LibCard
    let decks: [CardDeck]
    let onRead: (String) -> Void
    init(start: LibCard, decks: [CardDeck], onRead: @escaping (String) -> Void) { _card = State(initialValue: start); self.decks = decks; self.onRead = onRead }
    var body: some View {
        Group {
            if let d = decks.first(where: { $0.subject == card.subject }) {
                CardReader(card: card, deck: d, now: TodayView.testNow ?? Date(), go: { card = $0 }, onRead: onRead)
            }
        }
        .background(DeskTheme.canvas)
        .navigationTitle("\(card.subject) Day \(card.day)")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// 카드 한 장 전체
struct CardReader: View {
    let card: LibCard; let deck: CardDeck; let now: Date
    let go: (LibCard) -> Void
    let onRead: (String) -> Void
    var prev: LibCard? { card.index > 0 ? deck.cards[card.index - 1] : nil }
    var next: LibCard? { card.index + 1 < deck.cards.count ? deck.cards[card.index + 1] : nil }
    var status: String {
        let e = deck.elapsed(now)
        if deck.todayIndex(now) == card.index { return "오늘 카드" }
        if card.index > e { return "\(card.index - e)일 뒤 공부" }
        return "공부한 카드"
    }
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 8) {
                            Text(card.subject).desk(.label).foregroundStyle(DeskTheme.accent)
                            Text("Day \(card.day)").scaledFont(12, .semibold, mono: true).foregroundStyle(.secondary)
                            if let c = card.text["c"] { Text(c).desk(.small).foregroundStyle(.secondary) }
                            Spacer()
                            Text(status).scaledFont(12, .semibold).foregroundStyle(status == "오늘 카드" ? DeskTheme.live : .secondary)
                        }
                        Text(card.title).scaledFont(28, .bold).fixedSize(horizontal: false, vertical: true)
                        if let en = card.text["en"] { Text(en).desk(.body).foregroundStyle(.secondary) }
                    }
                    .id("top")
                    CardBody(card: card)
                    HStack {
                        if let p = prev { Button { go(p) } label: { Label("Day \(p.day) · \(p.title)", systemImage: "chevron.left").lineLimit(1) }.keyboardShortcut(.leftArrow, modifiers: []) }
                        Spacer(minLength: 12)
                        if let n = next { Button { go(n) } label: { HStack { Text("Day \(n.day) · \(n.title)").lineLimit(1); Image(systemName: "chevron.right") } }.keyboardShortcut(.rightArrow, modifiers: []) }
                    }
                    .desk(.bodyStrong).foregroundStyle(DeskTheme.accent).buttonStyle(.plain)
                    .padding(.top, 8)
                }
                .padding(.horizontal, 24).padding(.vertical, 20)
                .frame(maxWidth: 760, alignment: .leading)
                .frame(maxWidth: .infinity)
                .textSelection(.enabled)
            }
            .onAppear { CardReads.mark(card.id); onRead(card.id) }
            .onChange(of: card.id) { _, id in proxy.scrollTo("top", anchor: .top); CardReads.mark(id); onRead(id) }
        }
    }
}

/// 과목별 본문
struct CardBody: View {
    let card: LibCard
    func t(_ k: String) -> String { card.text[k]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            switch card.kind {
            case .geo:
                if !t("m").isEmpty { block("한 줄 정의") { Text(t("m")).scaledFont(18, .semibold).lineSpacing(4).fixedSize(horizontal: false, vertical: true) } }
                para("핵심 정리", t("a"))
                pairs("용어", card.lists["k"])
                para("자세히", t("d"))
                para("더 깊이", t("x"))
                if !t("r").isEmpty { block("문헌") { Text(t("r")).desk(.small).foregroundStyle(.secondary) } }
            case .kana:
                if !card.rows.isEmpty {
                    block("글자") { VStack(alignment: .leading, spacing: 10) { ForEach(card.rows, id: \.self) { Text($0).font(.system(size: 34, weight: .medium)).tracking(8) } } }
                }
                para("오늘 할 것", t("m"))
                para("외우는 법", t("g"))
                pairs("연습 단어", card.lists["w"])
            case .jpSentence:
                sentence(t("s"), t("m"), size: 26)
                expressions("표현", card.lists["v"])
                para("설명", t("g"))
                pairs("예문", (card.lists["e"] ?? []) + (card.lists["e2"] ?? []), vertical: true)
                pairs("단어", card.lists["w"])
            case .english:
                sentence(t("s"), t("m"), size: 24)
                para("쓰임", t("p"))
                dialogue(card.lists["d"])
                pairs("표현", card.lists["v"])
                para("발음 팁", t("x"))
            }
        }
    }
    func block<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) { Eyebrow(text: title); content() }
    }
    @ViewBuilder func para(_ title: String, _ s: String) -> some View {
        if !s.isEmpty { block(title) { Text(s).scaledFont(16).lineSpacing(6).fixedSize(horizontal: false, vertical: true) } }
    }
    @ViewBuilder func sentence(_ s: String, _ m: String, size: CGFloat) -> some View {
        if !s.isEmpty {
            block("오늘 문장") {
                VStack(alignment: .leading, spacing: 6) {
                    Text(s).font(.system(size: size, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                    if !m.isEmpty { Text(m).desk(.body).foregroundStyle(.secondary) }
                }
            }
        }
    }
    /// [항목, 설명] 목록 — vertical 이면 설명을 아래 줄에(예문)
    @ViewBuilder func pairs(_ title: String, _ rows: [[String]]?, vertical: Bool = false) -> some View {
        if let rows, !rows.isEmpty {
            block(title) {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        let a = r.first ?? "", b = r.dropFirst().last ?? ""
                        if vertical {
                            VStack(alignment: .leading, spacing: 3) { Text(a).scaledFont(17, .medium); if !b.isEmpty { Text(b).desk(.small).foregroundStyle(.secondary) } }
                        } else {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(a).scaledFont(15, .semibold).frame(minWidth: 90, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                                Text(b).scaledFont(15).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                            }
                        }
                    }
                }
            }
        }
    }
    /// 일본어 표현 [일본어, 읽기, 뜻]
    @ViewBuilder func expressions(_ title: String, _ rows: [[String]]?) -> some View {
        if let rows, !rows.isEmpty {
            block(title) {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(r.first ?? "").scaledFont(18, .medium)
                                if r.count > 2, !r[1].isEmpty { Text(r[1]).desk(.small).foregroundStyle(.secondary) }
                            }
                            Text(r.count > 2 ? r[2] : (r.last ?? "")).desk(.small).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
    /// 영어 대화 [화자, 영문, 뜻]
    @ViewBuilder func dialogue(_ rows: [[String]]?) -> some View {
        if let rows, !rows.isEmpty {
            block("대화") {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        HStack(alignment: .top, spacing: 10) {
                            Text(r.first ?? "").scaledFont(12, .bold).foregroundStyle(.white).frame(width: 24, height: 24)
                                .background(Circle().fill((r.first ?? "") == "A" ? DeskTheme.accent : DeskTheme.brand))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.count > 1 ? r[1] : "").scaledFont(16, .medium).fixedSize(horizontal: false, vertical: true)
                                if r.count > 2 { Text(r[2]).desk(.small).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
            }
        }
    }
}
