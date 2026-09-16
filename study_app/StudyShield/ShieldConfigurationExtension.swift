// 잠긴 앱을 열려고 할 때 iOS가 보여주는 화면의 문구
import ManagedSettings
import ManagedSettingsUI
import UIKit

class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    private func config() -> ShieldConfiguration {
        ShieldConfiguration(
            backgroundBlurStyle: .systemMaterial,
            backgroundColor: UIColor(red: 0.95, green: 0.95, blue: 0.97, alpha: 1),
            icon: UIImage(systemName: "book.closed.fill"),
            title: ShieldConfiguration.Label(text: "Study", color: .label),
            subtitle: ShieldConfiguration.Label(text: "오늘의 공부를 마치면 열립니다.\nStudy 앱에서 시험을 통과하세요.", color: .secondaryLabel),
            primaryButtonLabel: ShieldConfiguration.Label(text: "Study 열기", color: .white),
            primaryButtonBackgroundColor: UIColor(red: 0, green: 0.41, blue: 0.85, alpha: 1),
            secondaryButtonLabel: ShieldConfiguration.Label(text: "닫기", color: .secondaryLabel)
        )
    }
    override func configuration(shielding application: Application) -> ShieldConfiguration { config() }
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { config() }
    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { config() }
    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { config() }
}
