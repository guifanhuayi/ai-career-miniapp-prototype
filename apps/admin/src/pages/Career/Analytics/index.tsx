import { PageContainer } from '@ant-design/pro-components';
import { Alert, Button, Card, Input, Select, Space, Table } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { careerApi } from '@/services/career';
import type { ApiResult } from '../../../../../../packages/contracts/client';

type Report = ApiResult<'getAnalyticsReport'>;
const percent = (value: number | null) =>
  value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const names: Record<string, string> = {
  jd_submit: '提交岗位',
  ocr_result_confirmed: '确认截图核对稿',
  scene_selected: '选择学习方向',
  assessment_started: '开始测验',
  course_detail_viewed: '课程详情曝光',
  course_mark_changed: '看过状态变化',
  level_changed: '自主切换等级',
  analysis_completed: '分析成功',
  task_selected: '选择任务',
  assessment_submitted: '提交测验',
  recommendation_viewed: '推荐曝光',
  course_open_attempted: '打开课程',
  video_started: '播放开始',
  video_paused: '播放暂停',
  video_progress: '播放位置报告',
  video_ended: '播放结束报告',
  course_mark_set: '手动标记看过',
  course_mark_removed: '撤销看过',
  page_view: '页面曝光',
  learning_plan_resumed: '恢复学习任务',
};
export default function Analytics() {
  const [environment, setEnvironment] = useState<
    'production' | 'local' | 'test' | 'demo'
  >('production');
  const [startDay, setStartDay] = useState('');
  const [endDay, setEndDay] = useState('');
  const [data, setData] = useState<Report>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const refresh = async () => {
    const current = ++sequence.current;
    setLoading(true);
    setData(undefined);
    setError('');
    try {
      const result = await careerApi('getAnalyticsReport', {
        admin: true,
        query: {
          environment,
          ...(startDay ? { startDay } : {}),
          ...(endDay ? { endDay } : {}),
        },
      });
      if (current === sequence.current) setData(result);
    } catch (failure) {
      if (current === sequence.current)
        setError(failure instanceof Error ? failure.message : '报表暂不可用');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    return () => {
      ++sequence.current;
    };
  }, [environment]);
  const funnelColumns = [
    {
      title: '步骤',
      dataIndex: 'name',
      render: (value: string) => names[value] ?? value,
    },
    { title: '任务链', dataIndex: 'chains' },
    { title: '流程', dataIndex: 'flows' },
    { title: '去重访客', dataIndex: 'visitors' },
  ];
  return (
    <PageContainer title="行为与运营分析">
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          title="北京时间 · 匿名访客统计"
          description="默认正式环境。本机学习数据请选择local；测试/演示必须单独选择。没有正式数据时显示0，不混入模拟数据。"
        />
        <Space wrap>
          <Select
            aria-label="数据环境"
            value={environment}
            onChange={setEnvironment}
            options={[
              { value: 'production', label: '正式环境' },
              { value: 'local', label: '本地环境' },
              { value: 'test', label: '测试环境' },
              { value: 'demo', label: '演示环境' },
            ]}
          />
          <Input
            aria-label="开始日期"
            type="date"
            value={startDay}
            onChange={(e) => setStartDay(e.target.value)}
          />
          <Input
            aria-label="结束日期"
            type="date"
            value={endDay}
            onChange={(e) => setEndDay(e.target.value)}
          />
          <Button loading={loading} onClick={() => void refresh()}>
            查询报表
          </Button>
        </Space>
        {error && (
          <Alert
            type="error"
            showIcon
            title={error}
            description="请检查日期范围或连接后重新查询。"
          />
        )}
        {data && (
          <>
            <Alert
              type="success"
              title={`${data.startDay} 至 ${data.endDay} · ${data.environment} · 区间学习访客 ${data.activeVisitors}`}
              description="日、周、区间访客按集合去重；页面曝光不算学习活跃。最近24小时的漏斗仍在观察中。"
            />
            <Card title="日活跃 / 滚动7日活跃">
              <Table
                rowKey="day"
                dataSource={data.activity}
                columns={[
                  { title: '日期', dataIndex: 'day' },
                  { title: '学习DAU', dataIndex: 'dau' },
                  { title: '学习WAU', dataIndex: 'wau' },
                ]}
              />
            </Card>
            <Card title="岗位入口漏斗 · 24小时有序任务链">
              <Table
                rowKey="name"
                pagination={false}
                dataSource={data.jobFunnel}
                columns={funnelColumns}
              />
            </Card>
            <Card title="直接任务入口漏斗 · 24小时有序任务链">
              <Table
                rowKey="name"
                pagination={false}
                dataSource={data.taskFunnel}
                columns={funnelColumns}
              />
            </Card>
            <Card title="首次学习队列留存">
              <Table
                rowKey="day"
                dataSource={data.retention}
                columns={[
                  { title: '首学日', dataIndex: 'day' },
                  { title: '队列人数', dataIndex: 'cohortSize' },
                  ...(['d1', 'd7'] as const).map((key) => ({
                    title: key.toUpperCase(),
                    key,
                    render: (_: unknown, r: Report['retention'][number]) =>
                      r[key].pending
                        ? '待观察'
                        : `${percent(r[key].rate)}${r[key].ongoing ? '（观察中）' : ''} · ${r[key].returned}/${r.cohortSize}`,
                  })),
                ]}
              />
            </Card>
            <Card title="行为事实 · 打开 / 播放 / 手动看过分列">
              <Table
                rowKey="name"
                dataSource={data.events}
                columns={[
                  {
                    title: '行为',
                    dataIndex: 'name',
                    render: (value: string) => names[value] ?? value,
                  },
                  { title: '次数', dataIndex: 'count' },
                ]}
              />
              <p>
                时钟异常 {data.clockAnomalies} · 位置异常{' '}
                {data.positionAnomalies}
                。位置和结束报告不代表可信观看时长或认证完课。
              </p>
            </Card>
            <Card title="场景 / 任务 / 课程分布">
              <Table
                rowKey={(r) => `${r.kind}:${r.resourceId}`}
                dataSource={data.distribution}
                columns={[
                  { title: '类别', dataIndex: 'kind' },
                  { title: '内容ID', dataIndex: 'resourceId' },
                  {
                    title: '行为次数',
                    dataIndex: 'events',
                    render: (events: Report['events']) =>
                      events
                        .map((e) => `${names[e.name] ?? e.name} ${e.count}`)
                        .join('；'),
                  },
                ]}
              />
            </Card>
            <Card title="接口质量">
              <p>
                请求 {data.requests.count} · 失败 {data.requests.failures} ·
                成功率 {percent(data.requests.successRate)} · 重试{' '}
                {data.requests.retries}
              </p>
              <p>
                P50 {data.requests.p50Ms?.toFixed(2) ?? '—'} ms · P95{' '}
                {data.requests.p95Ms?.toFixed(2) ?? '—'} ms · 样本{' '}
                {data.requests.percentileSamples}
              </p>
              <p>
                百分位原始样本窗口：{data.requests.percentileStart} 至{' '}
                {data.requests.percentileEnd}（UTC）；不平均每日百分位。
              </p>
              <Table
                rowKey="name"
                dataSource={data.requests.errors}
                columns={[
                  { title: '错误分类', dataIndex: 'name' },
                  { title: '次数', dataIndex: 'count' },
                ]}
              />
            </Card>
            <Card title="岗位分析质量">
              <p>{data.analysis.provider}</p>
              <p>
                任务 {data.analysis.count} · 成功 {data.analysis.succeeded} ·
                失败 {data.analysis.failed} · 超时 {data.analysis.timedOut} ·
                无匹配率 {percent(data.analysis.noMatchRate)}
              </p>
              <p>
                已确认选择中的取消建议 {data.analysis.deselected}/
                {data.analysis.reviewedSelections} · 取消率{' '}
                {percent(data.analysis.deselectionRate)}
              </p>
              <p>
                {data.analysis.evidenceQuality} · 人工质量：
                {data.analysis.humanReview}
              </p>
            </Card>
          </>
        )}
      </Space>
    </PageContainer>
  );
}
