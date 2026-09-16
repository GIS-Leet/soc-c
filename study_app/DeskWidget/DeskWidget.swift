// 홈 화면 위젯 — 오늘 시간표. 앱이 App Group에 저장한 시간표를 읽어 현재·다음 수업을 강조
import WidgetKit
import SwiftUI


struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), table: Timetable(days: ["mon": [1: "106 통사2C", 3: "101 통사2C"]])) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), table: TimetableStore.timetable)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let now = Date(), cal = Calendar.current, table = TimetableStore.timetable
        var dates: Set<Date> = [now]
        let dayStart = cal.startOfDay(for: now), midnight = cal.date(byAdding: .day, value: 1, to: dayStart)!
        // 남은 분 표기가 맞게 5분마다(07:30~16:30), 교시 시작·끝 정각에도 항목
        var d = cal.date(bySettingHour: 7, minute: 30, second: 0, of: now)!
        let stop = cal.date(bySettingHour: 16, minute: 30, second: 0, of: now)!
        while d <= stop { if d > now { dates.insert(d) }; d = d.addingTimeInterval(5 * 60) }
        for (_, start) in Timetable.periodStart {
            for m in [start, start + Timetable.periodLength] {
                if let b = cal.date(bySettingHour: m / 60, minute: m % 60, second: 0, of: now), b > now { dates.insert(b) }
            }
        }
        dates.insert(midnight)
        completion(Timeline(entries: dates.sorted().map { Entry(date: $0, table: table) }, policy: .atEnd))
    }
}

struct DeskWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DeskTimetable", provider: Provider()) { DeskWidgetView(entry: $0) }
            .configurationDisplayName("오늘 시간표")
            .description("desk 시간표의 오늘 수업과 다음 수업")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct DeskWidgetBundle: WidgetBundle {
    var body: some Widget {
        DeskWidget(); CalendarWidget(); TodoWidget(); LockWidget()
        #if !targetEnvironment(macCatalyst)
        ClassActivityWidget()
        #endif
    }
}
