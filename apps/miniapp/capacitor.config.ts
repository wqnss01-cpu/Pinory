import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.pinory.mobile',
  appName: 'Pinory',
  webDir: 'dist',
  backgroundColor: '#f6f0e4',
  android: {
    backgroundColor: '#f6f0e4',
    allowMixedContent: false,
  },
};

export default config;
