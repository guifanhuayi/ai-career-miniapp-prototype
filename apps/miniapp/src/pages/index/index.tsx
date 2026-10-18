import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import ActionButton from '../../components/ActionButton';
import { api, ensureVisitor } from '../../services/api';

export default function EngineeringStatus() {
  const [status, setStatus] = useState('正在连接本地服务…');
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const health = await api('getHealth');
      const visitor = await ensureVisitor();
      setStatus(
        `API已连接 · ${health.database} · ${health.externalServices}。${visitor.storageNotice}`,
      );
    } catch {
      setStatus(
        '本地服务或访客记录连接失败，请检查API与MySQL后重试；已有记录不会被自动重置。',
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void check();
  }, []);
  return (
    <View className="page">
      <Text className="eyebrow">百年前程 · AI成长课</Text>
      <Text className="title">工程环境验证</Text>
      <Text className="description">
        使用已确认的白底、蓝色与橙黄色视觉。当前为工程验证入口，业务页面随模块接入。
      </Text>
      <View className="card">
        <Text className="description">{status}</Text>
        <ActionButton
          label="重新检查连接"
          loading={busy}
          disabled={busy}
          onClick={() => void check()}
        />
      </View>
      <Text className="description">
        此构建未上传微信，不代表真机验收。开发环境仅访问本机服务。
      </Text>
      <ActionButton
        label="查看学习方向目录"
        onClick={() => void Taro.navigateTo({ url: '/pages/catalog/index' })}
      />
    </View>
  );
}
