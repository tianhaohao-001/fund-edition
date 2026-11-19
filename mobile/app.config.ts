import type { ExpoConfig } from 'expo/config';

const microphonePermission = 'Morrowfolio uses the microphone on your iPhone or iPad to record a short idea. Review and edit the transcript before choosing to send it.';
const localNetworkPermission = 'Connect this iPhone or iPad to your own Morrowfolio computer over your private network. AI credentials stay on your computer.';

const config: ExpoConfig = {
  name: 'Morrowfolio',
  slug: 'morrowfolio',
  scheme: 'morrowfolio',
  version: '1.0.0',
  platforms: ['ios', 'web'],
  icon: './assets/icon.png',
  orientation: 'default',
  userInterfaceStyle: 'dark',
  backgroundColor: '#101023',
  locales: {
    en: { ios: { CFBundleDisplayName: 'Morrowfolio', NSMicrophoneUsageDescription: microphonePermission, NSLocalNetworkUsageDescription: localNetworkPermission } },
    'zh-Hans': { ios: { CFBundleDisplayName: 'Morrowfolio', NSMicrophoneUsageDescription: 'Morrowfolio 使用 iPhone 或 iPad 的麦克风录下简短想法。转写后可修改，由你确认才会发送。', NSLocalNetworkUsageDescription: '通过私人网络连接你自己的 Morrowfolio 电脑。AI 凭据始终保留在电脑上。' } },
  },
  ios: {
    bundleIdentifier: 'ai.morrowfolio.app',
    buildNumber: '1',
    supportsTablet: true,
    backgroundColor: '#101023',
    infoPlist: {
      CFBundleDisplayName: 'Morrowfolio',
      CFBundleLocalizations: ['en', 'zh-Hans'],
      NSMicrophoneUsageDescription: microphonePermission,
      NSLocalNetworkUsageDescription: localNetworkPermission,
    },
  },
  plugins: [
    ['expo-audio', { microphonePermission, enableBackgroundRecording: false, enableBackgroundPlayback: false }],
    ['expo-splash-screen', { image: './assets/icon.png', imageWidth: 180, backgroundColor: '#101023' }],
    'expo-secure-store',
  ],
};

export default config;
