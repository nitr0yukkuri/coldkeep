export type AppTab = 'home' | 'measure' | 'hydration' | 'thermal' | 'history';

export type AppTabDefinition = {
  key: AppTab;
  label: string;
  icon: string;
};

export const APP_TABS: readonly AppTabDefinition[] = [
  { key: 'home', label: 'ホーム', icon: '⌂' },
  { key: 'measure', label: '振る', icon: '⌁' },
  { key: 'hydration', label: '水分', icon: '＋' },
  { key: 'thermal', label: '温度', icon: '℃' },
  { key: 'history', label: '履歴', icon: '▥' },
];
