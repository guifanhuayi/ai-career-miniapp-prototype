import Taro from '@tarojs/taro';
import type { PropsWithChildren } from 'react';
import { pauseAnalytics, resumeAnalytics } from './services/analytics';
import './app.less';
export default function App({ children }: PropsWithChildren) {
  Taro.useDidShow(resumeAnalytics);
  Taro.useDidHide(pauseAnalytics);
  return children;
}
