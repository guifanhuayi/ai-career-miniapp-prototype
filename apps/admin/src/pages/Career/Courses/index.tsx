import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
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
import {
  errorText,
  levelOptions,
  ReleaseButton,
  Status,
  statusOptions,
} from '../shared';

type Course = ApiResult<'listAdminCourses'>['items'][number];
type Fields = Omit<ApiBody<'createCourse'>, 'idempotencyKey'>;
type Media = ApiResult<'listMediaAssets'>[number];
export default function Courses() {
  const [items, setItems] = useState<Course[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [tasks, setTasks] = useState<{ label: string; value: string }[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Course | 'new'>();
  const [saving, setSaving] = useState(false);
  const key = useRef(crypto.randomUUID());
  const [form] = Form.useForm<Fields>();
  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await careerApi('listAdminCourses', {
        admin: true,
        query: {
          page,
          pageSize: 20,
          search,
          status: status as 'draft' | 'published' | 'archived' | undefined,
        },
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [page, search, status]);
  useEffect(() => {
    void (async () => {
      try {
        setMedia(await careerApi('listMediaAssets', { admin: true }));
        const scenes = await careerApi('listAdminScenes', {
          admin: true,
          query: { pageSize: 100 },
        });
        const groups = await Promise.all(
          scenes.items.map(async (scene) => {
            const list = await careerApi('listAdminTasks', {
              admin: true,
              path: { sceneId: scene.id },
              query: { pageSize: 100 },
            });
            return list.items.map((task) => ({
              label: `${scene.name} / ${task.name}`,
              value: task.id,
            }));
          }),
        );
        setTasks(groups.flat());
      } catch (failure) {
        setError(errorText(failure));
      }
    })();
  }, []);
  const edit = (course: Course | 'new') => {
    setError('');
    key.current = crypto.randomUUID();
    form.resetFields();
    form.setFieldsValue(
      course === 'new'
        ? {
            title: '',
            author: '',
            durationSeconds: null,
            sourceUrl: '',
            mediaAssetId: null,
            authorization: '',
            isTest: true,
            chapters: [],
            mappings: [],
          }
        : {
            title: course.title,
            author: course.author,
            durationSeconds: course.durationSeconds,
            sourceUrl: course.sourceUrl,
            mediaAssetId: course.mediaAssetId,
            authorization: course.authorization,
            isTest: course.isTest,
            chapters: course.chapters,
            mappings: course.mappings,
          },
    );
    setEditing(course);
  };
  const save = async () => {
    const values = await form.validateFields().catch(() => undefined);
    if (!values || !editing || saving) return;
    setSaving(true);
    try {
      const fields: Fields = {
        ...values,
        durationSeconds: values.durationSeconds ?? null,
        mediaAssetId: values.mediaAssetId ?? null,
        sourceUrl: values.sourceUrl || null,
        authorization: values.authorization || null,
        chapters: values.chapters ?? [],
        mappings: values.mappings ?? [],
      };
      if (editing === 'new')
        await careerApi('createCourse', {
          admin: true,
          body: { ...fields, idempotencyKey: key.current },
        });
      else
        await careerApi('updateCourse', {
          admin: true,
          path: { courseId: editing.id },
          body: { ...fields, version: editing.version },
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
    <PageContainer title="课程内容">
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <Alert
          type="info"
          title="发布规则：实际总时长大于0且不超过35分钟"
          description="来源网页与播放媒体分别管理；发布时探测受控文件并核对章节总和、授权与任务关联。当前自制测试视频只有3秒，无教学内容。"
        />
        {error && (
          <Alert
            type="error"
            title={error}
            closable={{ onClose: () => setError('') }}
          />
        )}
        <Card
          title="课程列表"
          extra={
            <Button type="primary" onClick={() => edit('new')}>
              新建课程草稿
            </Button>
          }
        >
          <Space style={{ marginBottom: 16 }} wrap>
            <Input.Search
              aria-label="搜索课程"
              placeholder="课程标题"
              onSearch={(value) => {
                setSearch(value);
                setPage(1);
              }}
              allowClear
            />
            <Select
              aria-label="课程状态"
              placeholder="全部状态"
              allowClear
              options={statusOptions}
              style={{ width: 140 }}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
          </Space>
          <Table<Course>
            rowKey="id"
            dataSource={items}
            loading={loading}
            pagination={{
              current: page,
              total,
              pageSize: 20,
              showSizeChanger: false,
              onChange: setPage,
            }}
            scroll={{ x: 1000 }}
            columns={[
              { title: '标题', dataIndex: 'title' },
              {
                title: '素材',
                render: (_, row) =>
                  row.isTest ? <Tag color="orange">测试课程</Tag> : '教学课程',
              },
              {
                title: '实际时长（秒）',
                dataIndex: 'durationSeconds',
                render: (value) => value ?? '待核验',
              },
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
                      编辑课程
                    </Button>
                    <ReleaseButton
                      resource="course"
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
      </Space>
      <Modal
        title={
          editing === 'new'
            ? '新建课程草稿'
            : `编辑课程 · 版本${editing?.version ?? ''}`
        }
        open={!!editing}
        onCancel={() => setEditing(undefined)}
        onOk={() => void save()}
        confirmLoading={saving}
        okText="保存草稿/编辑"
        cancelText="取消"
        width={850}
      >
        {error && <Alert type="error" title={error} />}
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="课程标题" rules={[{ required: true }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="author" label="作者" rules={[{ required: true }]}>
            <Input maxLength={150} />
          </Form.Item>
          <Form.Item name="mediaAssetId" label="受控媒体（可先留空保存草稿）">
            <Select
              allowClear
              options={media.map((asset) => ({
                label: `${asset.id} · ${asset.durationSeconds}秒${asset.isTest ? ' · 测试' : ''}`,
                value: asset.id,
              }))}
              onChange={(id) => {
                const asset = media.find((item) => item.id === id);
                form.setFieldsValue({
                  durationSeconds: asset?.durationSeconds ?? null,
                  authorization: asset?.authorization ?? '',
                  isTest: asset?.isTest ?? true,
                });
              }}
            />
          </Form.Item>
          <Form.Item
            name="durationSeconds"
            label="实际总时长（秒，由媒体核验，不取整）"
          >
            <InputNumber min={0} precision={3} />
          </Form.Item>
          <Form.Item
            name="sourceUrl"
            label="来源参考网页（HTTPS，不能作为视频地址）"
          >
            <Input maxLength={1000} />
          </Form.Item>
          <Form.Item name="authorization" label="授权说明">
            <Input.TextArea maxLength={500} />
          </Form.Item>
          <Form.Item name="isTest" valuePropName="checked">
            <Checkbox>测试素材（对用户明确标识）</Checkbox>
          </Form.Item>
          <Card size="small" title="独立课程章节（不是知识点占位）">
            <Form.List name="chapters">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" wrap>
                      <Form.Item
                        name={[field.name, 'title']}
                        label={`章节${field.name + 1}`}
                        rules={[{ required: true }]}
                      >
                        <Input maxLength={200} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'durationSeconds']}
                        label="时长（秒）"
                        rules={[{ required: true }]}
                      >
                        <InputNumber min={0.001} precision={3} />
                      </Form.Item>
                      <Button onClick={() => remove(field.name)}>
                        移除章节
                      </Button>
                    </Space>
                  ))}
                  <Button
                    onClick={() => add({ title: '', durationSeconds: 1 })}
                  >
                    添加章节
                  </Button>
                </>
              )}
            </Form.List>
          </Card>
          <Card size="small" title="任务与等级关联" style={{ marginTop: 16 }}>
            <Form.List name="mappings">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" wrap>
                      <Form.Item
                        name={[field.name, 'taskId']}
                        label="任务"
                        rules={[{ required: true }]}
                      >
                        <Select
                          style={{ width: 350 }}
                          options={tasks}
                          showSearch={{ optionFilterProp: 'label' }}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'level']}
                        label="等级"
                        rules={[{ required: true }]}
                      >
                        <Select style={{ width: 100 }} options={levelOptions} />
                      </Form.Item>
                      <Button onClick={() => remove(field.name)}>
                        移除关联
                      </Button>
                    </Space>
                  ))}
                  <Button onClick={() => add({ level: 'beginner' })}>
                    添加关联
                  </Button>
                </>
              )}
            </Form.List>
          </Card>
        </Form>
      </Modal>
    </PageContainer>
  );
}
