export type AppTab = 'home' | 'measure' | 'hydration' | 'thermal' | 'history';

export type AppTabDefinition = {
  key: AppTab;
  label: string;
  icon: string;
};

export const APP_TABS: readonly AppTabDefinition[] = [
  { key: 'home', label: 'ホーム', icon: 'home-outline' },
  { key: 'measure', label: '振る', icon: 'pulse-outline' },
  { key: 'hydration', label: '水分', icon: 'water-outline' },
  { key: 'thermal', label: '温度', icon: 'thermometer-outline' },
  { key: 'history', label: '履歴', icon: 'time-outline' },
];
