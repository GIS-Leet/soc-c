// 좌석표·출석 — 반별 좌석 배치, 탭으로 관찰 기록·출결 표시 (상담 키로 암호화 저장)
import SwiftUI
import CryptoKit

struct SeatChartListView: View {
    let key: SymmetricKey
    var initialClassName: String? = nil
    @EnvironmentObject var store: DeskStore
    @State private var name = ""; @State private var rows = 5; @State private var cols = 6
    @State private var openID: String?
    var charts: [SeatChart] { store.charts(key: key).sorted { ($0.name == initialClassName ? 0 : 1, $0.name) < ($1.name == initialClassName ? 0 : 1, $1.name) } }
    var body: some View {
        List {
            Section("새 좌석표") {
                TextField("이름 (예: 2-3)", text: $name)
                Stepper("세로 \(rows)줄", value: $rows, in: 1...SeatChart.maxSide)
                Stepper("가로 \(cols)줄", value: $cols, in: 1...SeatChart.maxSide)
                Button("만들기") { Task { if let c = await store.newChart(name: name.trimmingCharacters(in: .whitespaces), rows: rows, cols: cols, key: key) { name = ""; openID = c.id } } }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Section("좌석표 \(charts.count)개") {
                if charts.isEmpty { EmptyHint(icon: "rectangle.grid.3x2", title: "좌석표가 없습니다", text: "반 이름과 줄·칸 수를 정해 만들면 자리를 눌러 관찰 기록과 출결을 바로 남길 수 있습니다.") }
                ForEach(charts) { c in
                    NavigationLink(value: "chart:" + c.id) {
                        HStack(spacing: 8) { ClassDot(name: c.name, size: 9); Text(c.name).scaledFont(16, .medium); Spacer(); Text("\(c.rows)×\(c.cols) · \(c.seated.count)명").font(.caption).foregroundStyle(.secondary) }
                    }
                    .swipeActions(edge: .trailing) { Button(role: .destructive) { store.deleteChart(c) } label: { Label("삭제", systemImage: "trash") } }
                }
            }
        }
        .listStyle(.insetGrouped)
        .onAppear { if name.isEmpty { name = initialClassName ?? "" } }
        .navigationTitle("좌석표").navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $openID) { id in SeatChartView(chartID: id, key: key) }
    }
}

struct SeatChartView: View {
    let chartID: String; let key: SymmetricKey
    @EnvironmentObject var store: DeskStore
    enum Mode: String, CaseIterable { case observe = "관찰", attend = "출석", arrange = "배치" }
    var initialMode: Mode = .observe
    @State private var mode: Mode = .observe
    @State private var chart: SeatChart? = nil
    @State private var date = Date()
    @State private var pickSeat: Int? = nil        // 배치: 고른 자리
    @State private var logStudent: Student? = nil  // 관찰: 고른 학생
    @State private var saveTask: Task<Void, Never>?
    var students: [Student] { store.students(key: key) }
    var byID: [String: Student] { Dictionary(uniqueKeysWithValues: students.map { ($0.id, $0) }) }
    var dateKey: String { FB.key(date) }
    var today: String { FB.key(Date()) }

    var body: some View {
        Group {
            if let c = chart {
                ScrollView {
                    VStack(spacing: 14) {
                        Picker("모드", selection: $mode) { ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) } }.pickerStyle(.segmented)
                        header(c)
                        grid(c)
                        hint
                    }
                    .padding(16)
                }
                .background(DeskTheme.canvas)
            } else { ContentUnavailableView("삭제된 좌석표", systemImage: "rectangle.grid.3x2") }
        }
        .navigationTitle(chart?.name ?? "좌석표").navigationBarTitleDisplayMode(.inline)
        .onAppear { if chart == nil { mode = initialMode; chart = store.charts(key: key).first { $0.id == chartID } } }
        .sheet(item: $pickSeat) { i in PickStudentSheet(students: students, seated: chart?.seated ?? [], current: chart?.seats[i] ?? nil) { sid in var c = chart!; if let sid { c.seats = c.seats.map { $0 == sid ? nil : $0 } }; c.seats[i] = sid; update(c) } }
        .sheet(item: $logStudent) { s in QuickLogSheet(student: s, key: key) }
    }
    func header(_ c: SeatChart) -> some View {
        HStack {
            switch mode {
            case .attend:
                DatePicker("", selection: $date, displayedComponents: .date).labelsHidden()
                Spacer()
                let n = c.counts(on: dateKey)
                Text(n.isEmpty ? "전원 출석" : SeatChart.summaryText(n)).scaledFont(13, .semibold).foregroundStyle(n.isEmpty ? DeskTheme.success : DeskTheme.live)
            case .observe:
                Text("자리를 누르면 기록, 어떤 모드에서든 길게 누르면 바로 기록").font(.footnote).foregroundStyle(.secondary); Spacer()
            case .arrange:
                Text("배치 \(c.seated.count) / 학생 \(students.count)명").font(.footnote).foregroundStyle(.secondary); Spacer()
            }
        }
    }
    func grid(_ c: SeatChart) -> some View {
        DeskCard {
            Text("교탁").desk(.label).tracking(1).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                .padding(.vertical, 4).background(RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.05)))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: c.cols), spacing: 6) {
                ForEach(0..<(c.rows * c.cols), id: \.self) { i in
                    let sid = c.seats[i], s = sid.flatMap { byID[$0] }
                    SeatCell(student: s, mark: mode == .attend ? sid.flatMap { c.mark($0, on: dateKey) } : nil,
                             dot: mode == .observe && (s?.logs.contains { $0.date == today } ?? false), arranging: mode == .arrange)
                        .onTapGesture { tap(i, c) }
                        .onLongPressGesture(minimumDuration: 0.4) { if let s { logStudent = s } }   // 어떤 모드든 길게 누르면 바로 기록
                }
            }
        }
    }
    var hint: some View {
        Text(mode == .attend ? "누를 때마다 — → 지각 → 결석 → 조퇴 순으로 바뀌고, 자동 저장됩니다." : mode == .arrange ? "빈 자리를 눌러 학생을 앉히고, 앉은 자리를 눌러 바꾸거나 비웁니다." : "")
            .font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
    }
    func tap(_ i: Int, _ c: SeatChart) {
        switch mode {
        case .arrange: pickSeat = i
        case .observe: if let sid = c.seats[i], let s = byID[sid] { logStudent = s }
        case .attend: if let sid = c.seats[i] { var n = c; n.cycle(sid, on: dateKey); update(n) }
        }
    }
    func update(_ c: SeatChart) {
        chart = c
        saveTask?.cancel(); saveTask = Task { try? await Task.sleep(for: .seconds(0.8)); if !Task.isCancelled { store.saveChart(c, key: key) } }
    }
}

extension Int: @retroactive Identifiable { public var id: Int { self } }

struct SeatCell: View {
    let student: Student?; let mark: String?; let dot: Bool; let arranging: Bool
    var color: Color { switch mark { case "결석": DeskTheme.live; case "지각": DeskTheme.warn; case "조퇴": DeskTheme.accent; default: .clear } }
    var body: some View {
        VStack(spacing: 1) {
            if let s = student {
                Text(s.num.isEmpty ? " " : s.num).scaledFont(10, .semibold, mono: true).foregroundStyle(mark == nil ? Color.secondary : Color.white.opacity(0.85))
                Text(s.name).scaledFont(12, .semibold).lineLimit(1).minimumScaleFactor(0.7).foregroundStyle(mark == nil ? Color.primary : Color.white)
                if let m = mark { Text(m).scaledFont(9, .bold).foregroundStyle(.white) }
            } else {
                Image(systemName: arranging ? "plus" : "minus").scaledFont(11).foregroundStyle(Color.primary.opacity(0.25))
            }
        }
        .frame(maxWidth: .infinity).frame(height: 50)
        .background(RoundedRectangle(cornerRadius: 8).fill(mark != nil ? color : student == nil ? Color.primary.opacity(0.04) : Color.primary.opacity(0.07)))
        .overlay(alignment: .topTrailing) { if dot { Circle().fill(DeskTheme.accent).frame(width: 6, height: 6).padding(4) } }
        .contentShape(RoundedRectangle(cornerRadius: 8))
    }
}

/// 배치: 빈 자리에 앉힐 학생 고르기 (이미 앉은 학생은 옮김)
struct PickStudentSheet: View {
    let students: [Student]; let seated: Set<String>; let current: String?
    let pick: (String?) -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                if current != nil { Section { Button("자리 비우기", role: .destructive) { pick(nil); dismiss() } } }
                Section("학생") {
                    ForEach(students) { s in
                        Button { pick(s.id); dismiss() } label: {
                            HStack { Text(s.num).scaledFont(13, .semibold, mono: true).foregroundStyle(.secondary).frame(width: 28, alignment: .leading); Text(s.name); Spacer()
                                if s.id == current { Image(systemName: "checkmark").foregroundStyle(DeskTheme.accent) } else if seated.contains(s.id) { Text("앉음").font(.caption).foregroundStyle(.secondary) } }
                        }.buttonStyle(.plain)
                    }
                }
            }
            .navigationTitle("자리에 앉힐 학생").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }
}

/// 관찰: 종류·내용만 적고 바로 기록
struct QuickLogSheet: View {
    let student: Student; let key: SymmetricKey
    @EnvironmentObject var store: DeskStore
    @Environment(\.dismiss) private var dismiss
    @State private var tag = "관찰"; @State private var text = ""; @State private var saving = false; @State private var recordID = UUID().uuidString; @State private var submitted: StudentLog?
    static let quick = ["발표 잘함", "수업 참여 우수", "졸음", "딴짓", "과제 미제출", "친구 도움"]
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("종류", selection: $tag) { ForEach(StudentDetailView.tags, id: \.self) { Text($0) } }.pickerStyle(.segmented)
                    HStack(alignment: .top) { TextField("내용 (마이크를 누르고 말해도 됩니다)", text: $text, axis: .vertical).lineLimit(2...5); MicButton(text: $text) }
                }
                Section("빠른 입력") {
                    FlowChips(items: Self.quick) { text = text.isEmpty ? $0 : text + ", " + $0 }
                }
                Section("오늘 기록") {
                    let todays = student.logs.filter { $0.date == FB.key(Date()) }
                    if todays.isEmpty { Text("없음").foregroundStyle(.secondary) }
                    ForEach(todays) { l in HStack { Text(l.tag).font(.caption.weight(.semibold)).foregroundStyle(.secondary); Text(l.text).desk(.body) } }
                }
            }
            .disabled(saving || submitted != nil)
            .navigationTitle("\(student.num.isEmpty ? "" : student.num + "번 ")\(student.name)").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("기록") { if submitted == nil { submitted=StudentLog(id: student.logs.count,date: FB.key(Date()),text: text.trimmingCharacters(in: .whitespacesAndNewlines),tag: tag,recordID: recordID) }; saving = true; Task { defer { saving = false }; if let submitted,await store.editStudent(student.id, .appendLog(submitted), key: key) { dismiss() } } }.disabled(saving || text.trimmingCharacters(in: .whitespaces).isEmpty) }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct FlowChips: View {
    let items: [String]; let tap: (String) -> Void
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) { ForEach(items, id: \.self) { s in Button(s) { tap(s) }.buttonStyle(.bordered).desk(.small) } }
        }
    }
}
