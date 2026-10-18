import { PageContainer, ProDescriptions } from '@ant-design/pro-components';
import { Alert, Button, Card, Space } from 'antd';
import { useEffect, useState } from 'react';
import { careerApi } from '@/services/career';
import type { ApiResult } from '../../../../../../packages/contracts/client';

type Health = ApiResult<'getLocalAdminSystem'>;
export default function System() {
  const [health, setHealth] = useState<Health>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setHealth(await careerApi('getLocalAdminSystem', { admin: true }));
    } catch (failure) {
      setHealth(undefined);
      setError(failure instanceof Error ? failure.message : '无法连接服务');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <PageContainer title="本地工程状态">
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          title="首期本地管理环境"
          description="仅在本机开放。外部OCR与模型使用明确标注的本地模拟适配器；此页不代表业务功能已验收。"
          type="info"
          showIcon
        />
        {error && <Alert title={error} type="error" showIcon />}
        <Card
          title="API与数据库"
          extra={
            <Button onClick={() => void refresh()} loading={loading}>
              重新检查
            </Button>
          }
        >
          <ProDescriptions<Health>
            column={2}
            dataSource={health}
            columns={[
              { title: '服务状态', dataIndex: 'status' },
              { title: '数据库', dataIndex: 'database' },
              { title: '数据环境', dataIndex: 'environment' },
              { title: '外部依赖', dataIndex: 'externalServices' },
            ]}
          />
        </Card>
      </Space>
    </PageContainer>
  );
}
