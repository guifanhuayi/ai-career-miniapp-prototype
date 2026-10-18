import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import { careerApi } from '@/services/career';
import type {
  ApiBody,
  ApiResult,
} from '../../../../../../packages/contracts/client';
import { errorText, ReleaseButton, Status } from '../shared';

type Set = ApiResult<'listQuestionSets'>['items'][number];
type Fields = Pick<
  ApiBody<'createQuestionSet'>,
  'sceneId' | 'version' | 'questions'
>;
export default function Questions() {
  const [items, setItems] = useState<Set[]>([]);
  const [scenes, setScenes] = useState<{ label: string; value: string }[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Set | 'new'>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<Fields>();
  const key = useRef(crypto.randomUUID());
  const load = async () => {
    try {
      const result = await careerApi('listQuestionSets', {
        admin: true,
        query: { page, pageSize: 20 },
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (failure) {
      setError(errorText(failure));
    }
  };
  useEffect(() => {
    void load();
  }, [page]);
  useEffect(() => {
    void careerApi('listAdminScenes', { admin: true, query: { pageSize: 100 } })
      .then((result) =>
        setScenes(
          result.items.map((scene) => ({ label: scene.name, value: scene.id })),
        ),
      )
      .catch((failure) => setError(errorText(failure)));
  }, []);
  const edit = (set: Set, fork: boolean) => {
    setError('');
    form.resetFields();
    key.current = crypto.randomUUID();
    form.setFieldsValue({
      sceneId: set.sceneId,
      version: fork ? `mock-v${Date.now()}` : set.version,
      questions: set.questions,
    });
    setEditing(fork ? 'new' : set);
  };
  const save = async () => {
    const fields = await form.validateFields().catch(() => undefined);
    if (!fields || !editing || saving) return;
    setSaving(true);
    try {
      if (editing === 'new')
        await careerApi('createQuestionSet', {
          admin: true,
          body: { ...fields, isMock: true, idempotencyKey: key.current },
        });
      else
        await careerApi('updateQuestionSet', {
          admin: true,
          path: { questionSetId: editing.id },
          body: { revision: editing.revision, questions: fields.questions },
        });
      setEditing(undefined);
      await load();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  };
  return (
    <PageContainer title="模拟题库版本">
      <Alert
        type="info"
        title="模拟四题规则：0/1分初阶，2/3分进阶，4分高阶"
        description="正式题库由产品方后续提供。发布过的版本不改题；创建新版本保留历史答题依据。"
      />
      {error && (
        <Alert
          type="error"
          title={error}
          closable={{ onClose: () => setError('') }}
        />
      )}
      <Card title="场景题库" style={{ marginTop: 16 }}>
        <Table<Set>
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
            {
              title: '场景',
              render: (_, row) =>
                scenes.find((scene) => scene.value === row.sceneId)?.label ??
                row.sceneId,
            },
            { title: '版本', dataIndex: 'version' },
            { title: '属性', render: () => <Tag color="orange">模拟题库</Tag> },
            {
              title: '状态',
              render: (_, row) => <Status value={row.status} />,
            },
            { title: '修订', dataIndex: 'revision' },
            {
              title: '操作',
              render: (_, row) => (
                <Space wrap>
                  {row.status === 'draft' && (
                    <Button size="small" onClick={() => edit(row, false)}>
                      编辑题目
                    </Button>
                  )}
                  <Button size="small" onClick={() => edit(row, true)}>
                    复制为新版本
                  </Button>
                  <ReleaseButton
                    resource="question-set"
                    id={row.id}
                    version={row.revision}
                    status={row.status}
                    onDone={() => void load()}
                    onError={setError}
                  />
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing === 'new' ? '创建模拟题库新版本' : '编辑模拟题库草稿'}
        open={!!editing}
        width={850}
        onCancel={() => setEditing(undefined)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        {error && <Alert type="error" title={error} />}
        <Form form={form} layout="vertical">
          <Form.Item name="sceneId" label="场景" rules={[{ required: true }]}>
            <Select disabled={editing !== 'new'} options={scenes} />
          </Form.Item>
          <Form.Item
            name="version"
            label="版本标识（mock-开头）"
            rules={[{ required: true, pattern: /^mock-[a-zA-Z0-9_-]{1,75}$/ }]}
          >
            <Input disabled={editing !== 'new'} />
          </Form.Item>
          {[0, 1, 2, 3].map((index) => (
            <Card
              key={index}
              size="small"
              title={`第${index + 1}题${index === 0 || index === 3 ? ' · 通用题' : ' · 场景题'}`}
              style={{ marginBottom: 16 }}
            >
              <Form.Item
                name={['questions', index, 'id']}
                label="稳定题目ID"
                rules={[{ required: true }]}
              >
                <Input maxLength={64} />
              </Form.Item>
              <Form.Item
                name={['questions', index, 'title']}
                label="题干"
                rules={[{ required: true }]}
              >
                <Input.TextArea maxLength={500} />
              </Form.Item>
              {[0, 1, 2].map((option) => (
                <Form.Item
                  key={option}
                  name={['questions', index, 'options', option]}
                  label={`选项${option + 1}`}
                  rules={[{ required: true }]}
                >
                  <Input maxLength={300} />
                </Form.Item>
              ))}
              <Form.Item
                name={['questions', index, 'correct']}
                label="正确选项"
                rules={[{ required: true }]}
              >
                <Select
                  options={[0, 1, 2].map((value) => ({
                    label: `选项${value + 1}`,
                    value,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name={['questions', index, 'explanation']}
                label="答案说明"
                rules={[{ required: true }]}
              >
                <Input.TextArea maxLength={1000} />
              </Form.Item>
            </Card>
          ))}
        </Form>
      </Modal>
    </PageContainer>
  );
}
