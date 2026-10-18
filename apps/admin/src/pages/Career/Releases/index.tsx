import { PageContainer } from '@ant-design/pro-components';
import { Alert, Card, Table } from 'antd';
import { useEffect, useState } from 'react';
import { careerApi } from '@/services/career';
import type { ApiResult } from '../../../../../../packages/contracts/client';
import { errorText } from '../shared';

type Release = ApiResult<'listContentAudits'>['items'][number];
export default function Releases() {
  const [items, setItems] = useState<Release[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    void careerApi('listContentAudits', {
      admin: true,
      query: { page, pageSize: 20 },
    })
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setError('');
      })
      .catch((failure) => setError(errorText(failure)));
  }, [page]);
  return (
    <PageContainer title="发布审计">
      {error && <Alert type="error" title={error} />}
      <Card title="内容创建、编辑、发布与下架记录">
        <Table<Release>
          rowKey="id"
          dataSource={items}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
          scroll={{ x: 1000 }}
          columns={[
            { title: '资源类型', dataIndex: 'resource' },
            { title: '资源ID', dataIndex: 'resourceId' },
            {
              title: '操作',
              dataIndex: 'action',
              render: (value: string) =>
                (
                  ({
                    create: '创建',
                    update: '编辑',
                    publish: '发布',
                    archive: '下架',
                  }) as Record<string, string>
                )[value] ?? value,
            },
            { title: '原版本', dataIndex: 'fromVersion' },
            { title: '新版本', dataIndex: 'toVersion' },
            {
              title: '时间（上海）',
              dataIndex: 'createdAt',
              render: (value) =>
                new Date(value).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  hour12: false,
                }),
            },
          ]}
        />
      </Card>
    </PageContainer>
  );
}
