import { resolve } from 'node:path';
import { defineConfig } from '@tarojs/cli';

const sharedSources = [
  resolve(__dirname, '../../../packages/contracts'),
  resolve(__dirname, '../../../packages/domain/src'),
];

export default defineConfig({
  projectName: 'ai-career-miniapp',
  date: '2026-10-18',
  designWidth: 393,
  deviceRatio: { 393: 750 / 393 },
  sourceRoot: 'src',
  outputRoot: process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist',
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: false },
  plugins: [],
  defineConstants: { API_BASE_URL: JSON.stringify('http://127.0.0.1:3100') },
  mini: {
    compile: { include: sharedSources },
    postcss: { pxtransform: { enable: true }, cssModules: { enable: false } },
  },
  h5: {
    compile: { include: sharedSources },
    publicPath: '/',
    router: { mode: 'hash' },
    devServer: { host: '127.0.0.1', port: 10086 },
    postcss: {
      pxtransform: { enable: true },
      autoprefixer: { enable: true },
      cssModules: { enable: false },
    },
  },
});
