import { defineConfig } from '@umijs/max';
import defaultSettings from './defaultSettings';

// Official Ant Design Pro v6.0.3 runtime and default design system.
// Template demos remain archived in the source, outside the product routes.
export default defineConfig({
  hash: true,
  esbuildMinifyIIFE: true,
  title: 'AI成长课 · 内容管理',
  routes: [
    { path: '/', redirect: '/system' },
    {
      path: '/system',
      name: '工程状态',
      icon: 'DashboardOutlined',
      component: './Career/System',
    },
    { path: '*', component: './exception/404' },
  ],
  model: {},
  initialState: {},
  layout: { locale: false, ...defaultSettings },
  locale: { default: 'zh-CN', antd: true, baseNavigator: false },
  antd: {},
  request: {},
  access: {},
  mock: false,
  proxy: { '/api': { target: 'http://127.0.0.1:3100', changeOrigin: true } },
  define: {
    __APP_VERSION__: '0.1.0',
    __UMI_VERSION__: require('@umijs/max/package.json').version,
    __UTOO_VERSION__: '',
  },
});
