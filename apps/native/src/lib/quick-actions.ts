import * as QuickActions from 'expo-quick-actions';
import type { RouterAction } from 'expo-quick-actions/router';

export async function configureAppShortcuts(): Promise<void> {
  const supported = await QuickActions.isSupported();
  if (!supported) {
    return;
  }

  await QuickActions.setItems<RouterAction>([
    {
      id: 'tonight',
      title: '今夜何見る？',
      subtitle: '放送日が近い作品を確認',
      icon: 'symbol:play.tv',
      params: { href: '/tonight' },
    },
    {
      id: 'tier',
      title: 'ティア表',
      icon: 'symbol:list.star',
      params: { href: '/' },
    },
    {
      id: 'watchlist',
      title: '視聴管理',
      icon: 'symbol:list.bullet',
      params: { href: '/watchlist' },
    },
    {
      id: 'explore',
      title: 'Explore',
      icon: 'symbol:sparkles',
      params: { href: '/explore' },
    },
  ]);
}