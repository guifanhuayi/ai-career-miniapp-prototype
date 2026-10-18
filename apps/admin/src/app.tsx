import type { RunTimeLayoutConfig } from '@umijs/max';
import defaultSettings from '../config/defaultSettings';

export async function getInitialState() {
  return { settings: defaultSettings };
}
export const layout: RunTimeLayoutConfig = () => ({
  ...defaultSettings,
  title: 'AI成长课 · 内容管理',
  actionsRender: () => [],
  avatarProps: undefined,
  footerRender: false,
  links: [],
});
