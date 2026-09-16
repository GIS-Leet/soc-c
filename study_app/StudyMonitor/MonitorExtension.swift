// 예정 시각이 되면 잠글 앱들에 자물쇠를 건다 (DeviceActivity 스케줄의 시작 시점에 호출됨)
import DeviceActivity
import ManagedSettings

class MonitorExtension: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        Store.lock()
    }
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)   // 자물쇠는 시험을 통과해야 풀리므로 여기서는 아무것도 안 함
    }
}
