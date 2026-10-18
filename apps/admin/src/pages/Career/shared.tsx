import { Button, Popconfirm, Tag } from 'antd';
import { useRef, useState } from 'react';
import { careerApi } from '@/services/career';
import type { ApiBody } from '../../../../../packages/contracts/client';
import {
  levelNames,
  levels,
  sceneCategories,
} from '../../../../../packages/domain/src';

export const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '已下架', value: 'archived' },
];
export const levelOptions = levels.map((value) => ({
  label: levelNames[value],
  value,
}));
export const categoryOptions = sceneCategories.map((value) => ({
  label: value,
  value,
}));
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试';
export function Status({ value }: { value: string }) {
  return (
    <Tag
      color={
        value === 'published'
          ? 'green'
          : value === 'archived'
            ? 'default'
            : 'orange'
      }
    >
      {statusOptions.find((option) => option.value === value)?.label ?? value}
    </Tag>
  );
}
export function ReleaseButton({
  resource,
  id,
  version,
  status,
  onDone,
  onError,
}: {
  resource: ApiBody<'createContentRelease'>['resource'];
  id: string;
  version: number;
  status: string;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const nextStatus = status === 'published' ? 'archived' : 'published';
  const label = nextStatus === 'published' ? '发布' : '下架';
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await careerApi('createContentRelease', {
        admin: true,
        body: {
          resource,
          resourceId: id,
          version,
          status: nextStatus,
          idempotencyKey: key.current,
        },
      });
      key.current = crypto.randomUUID();
      onDone();
    } catch (error) {
      onError(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popconfirm
      title={`确认${label}当前版本？`}
      description="服务器将校验版本与发布规则，操作会保留审计记录。"
      onConfirm={submit}
      okText="确认"
      cancelText="取消"
    >
      <Button size="small" loading={busy}>
        {label}
      </Button>
    </Popconfirm>
  );
}
