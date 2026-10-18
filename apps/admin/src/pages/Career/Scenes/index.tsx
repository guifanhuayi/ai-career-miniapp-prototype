import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
} from 'antd';
import { useEffect, useState } from 'react';
import { careerApi } from '@/services/career';
import type {
  ApiBody,
  ApiResult,
} from '../../../../../../packages/contracts/client';
import { categoryOptions, errorText, ReleaseButton, Status } from '../shared';

type Scene = ApiResult<'listAdminScenes'>['items'][number];
type Task = ApiResult<'listAdminTasks'>['items'][number];
type SceneForm = Omit<ApiBody<'updateScene'>, 'syllabus'> & {
  beginner: string;
  intermediate: string;
  advanced: string;
};
export default function Scenes() {
  const [items, setItems] = useState<Scene[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Scene>();
  const [selected, setSelected] = useState<Scene>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [task, setTask] = useState<Task>();
  const [saving, setSaving] = useState(false);
  const [sceneForm] = Form.useForm<SceneForm>();
  const [taskForm] = Form.useForm<ApiBody<'updateTask'>>();
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(
        (
          await careerApi('listAdminScenes', {
            admin: true,
            query: { pageSize: 100, search },
          })
        ).items,
      );
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [search]);
  const loadTasks = async (scene: Scene) => {
    setSelected(scene);
    setTasks([]);
    try {
      setTasks(
        (
          await careerApi('listAdminTasks', {
            admin: true,
            path: { sceneId: scene.id },
            query: { pageSize: 100 },
          })
        ).items,
      );
    } catch (failure) {
      setError(errorText(failure));
    }
  };
  const edit = (scene: Scene) => {
    setError('');
    sceneForm.setFieldsValue({
      ...scene,
      beginner: scene.syllabus.beginner.join('\n'),
      intermediate: scene.syllabus.intermediate.join('\n'),
      advanced: scene.syllabus.advanced.join('\n'),
    });
    setEditing(scene);
  };
  const saveScene = async () => {
    const values = await sceneForm.validateFields().catch(() => undefined);
    if (!values || !editing || saving) return;
    setSaving(true);
    try {
      const { beginner, intermediate, advanced, ...fields } = values;
      await careerApi('updateScene', {
        admin: true,
        path: { sceneId: editing.id },
        body: {
          ...fields,
          version: editing.version,
          syllabus: {
            beginner: beginner.split('\n'),
            intermediate: intermediate.split('\n'),
            advanced: advanced.split('\n'),
          },
        },
      });
      setEditing(undefined);
      await load();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  };
  const saveTask = async () => {
    const fields = await taskForm.validateFields().catch(() => undefined);
    if (!fields || !task || !selected || saving) return;
    setSaving(true);
    try {
      await careerApi('updateTask', {
        admin: true,
        path: { taskId: task.id },
        body: { ...fields, version: task.version },
      });
      setTask(undefined);
      await loadTasks(selected);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  };
  return (
    <PageContainer title="场景与任务">
      {error && (
        <Alert
          type="error"
          title={error}
          closable={{ onClose: () => setError('') }}
        />
      )}
      <Card
        title="原型17类场景"
        extra={
          <Input.Search
            aria-label="搜索场景或任务"
            placeholder="搜索场景或任务"
            onSearch={setSearch}
            allowClear
          />
        }
      >
        <Table<Scene>
          rowKey="id"
          dataSource={items}
          loading={loading}
          pagination={false}
          scroll={{ x: 950 }}
          columns={[
            { title: '场景', dataIndex: 'name' },
            { title: '分类', dataIndex: 'category' },
            { title: '任务数', dataIndex: 'taskCount' },
            { title: '版本', dataIndex: 'version' },
            {
              title: '状态',
              render: (_, row) => <Status value={row.status} />,
            },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => edit(row)}>
                    编辑场景
                  </Button>
                  <Button size="small" onClick={() => void loadTasks(row)}>
                    任务
                  </Button>
                  <ReleaseButton
                    resource="scene"
                    id={row.id}
                    version={row.version}
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
        title={`编辑场景 · ${editing?.name ?? ''}`}
        open={!!editing}
        onCancel={() => setEditing(undefined)}
        onOk={() => void saveScene()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        {error && <Alert type="error" title={error} />}
        <Form form={sceneForm} layout="vertical">
          <Form.Item name="name" label="场景名称" rules={[{ required: true }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item
            name="description"
            label="场景说明"
            rules={[{ required: true }]}
          >
            <Input.TextArea maxLength={300} />
          </Form.Item>
          <Form.Item
            name="output"
            label="学习产出"
            rules={[{ required: true }]}
          >
            <Input.TextArea maxLength={300} />
          </Form.Item>
          <Form.Item name="position" label="排序" rules={[{ required: true }]}>
            <InputNumber min={0} max={10000} />
          </Form.Item>
          {(['beginner', 'intermediate', 'advanced'] as const).map(
            (level, index) => (
              <Form.Item
                key={level}
                name={level}
                label={`${['初阶', '进阶', '高阶'][index]}知识点（每行一个）`}
                rules={[{ required: true }]}
              >
                <Input.TextArea rows={3} />
              </Form.Item>
            ),
          )}
        </Form>
      </Modal>
      <Modal
        title={`${selected?.name ?? ''} · 任务`}
        open={!!selected}
        onCancel={() => setSelected(undefined)}
        footer={null}
        width={850}
      >
        <Table<Task>
          rowKey="id"
          dataSource={tasks}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '版本', dataIndex: 'version' },
            {
              title: '状态',
              render: (_, row) => <Status value={row.status} />,
            },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  <Button
                    onClick={() => {
                      taskForm.setFieldsValue({
                        name: row.name,
                        position: row.position,
                      });
                      setTask(row);
                    }}
                  >
                    编辑任务
                  </Button>
                  <ReleaseButton
                    resource="task"
                    id={row.id}
                    version={row.version}
                    status={row.status}
                    onDone={() => selected && void loadTasks(selected)}
                    onError={setError}
                  />
                </Space>
              ),
            },
          ]}
        />
      </Modal>
      <Modal
        title="编辑任务"
        open={!!task}
        onCancel={() => setTask(undefined)}
        onOk={() => void saveTask()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        {error && <Alert type="error" title={error} />}
        <Form form={taskForm} layout="vertical">
          <Form.Item name="name" label="任务名称" rules={[{ required: true }]}>
            <Input maxLength={150} />
          </Form.Item>
          <Form.Item name="position" label="排序" rules={[{ required: true }]}>
            <InputNumber min={0} max={10000} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
