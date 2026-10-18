import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { type Level, levelNames } from '../../../../../packages/domain/src';
import ActionButton from '../../components/ActionButton';
import LoadState from '../../components/LoadState';
import { guestApi } from '../../services/api';
import { messageOf, openPlan } from '../../services/learning';
import { useResource } from '../../services/useResource';

export default function Plans() {
  const [page, setPage] = useState(1);
  const [analysisPage, setAnalysisPage] = useState(1);
  const { data, error, reload } = useResource(
    () => guestApi('listLearningPlans', { query: { page, pageSize: 20 } }),
    String(page),
  );
  const analyses = useResource(
    () =>
      guestApi('listAnalysisJobs', {
        query: { page: analysisPage, pageSize: 20 },
      }),
    `recent-analyses:${analysisPage}`,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const groups = data
    ? [...new Set(data.items.map((p) => p.sceneId))].map((sceneId) => ({
        sceneId,
        plans: data.items.filter((p) => p.sceneId === sceneId),
      }))
    : [];
  return (
    <View className="page">
      <Text className="eyebrow">MY LEARNING PATH</Text>
      <Text className="title">让每次学习，</Text>
      <Text className="title green">都朝着目标前进。</Text>
      <Text className="description">
        学习记录保存在当前访客下。同一设备可继续；清除存储或更换设备后无法自动恢复。
      </Text>
      {!data ? (
        <LoadState error={error} retry={reload} />
      ) : (
        <>
          <Text className="row-title">
            {data.total} 个学习任务，按你的节奏来。
          </Text>
          {groups.map((group) => (
            <View key={group.sceneId}>
              <Text className="row-title">{group.plans[0]?.sceneName}</Text>
              {group.plans.map((p) => (
                <View key={p.id} className="card">
                  <Text className="row-title">
                    {p.sceneName} · {p.taskName}
                  </Text>
                  <Text className="catalog-count">来源：{p.sourceTitle}</Text>
                  <Text className="description">
                    {!p.available
                      ? '任务已下架，历史记录保留'
                      : p.latestAttemptStatus === 'draft'
                        ? '有未完成的测验'
                        : p.selectedLevel
                          ? `${levelNames[p.selectedLevel as Level]} · 手动看过 ${p.markedCount} / ${p.courseCount} 门`
                          : '待完成能力小测'}
                  </Text>
                  <ActionButton
                    label={`继续任务：${p.taskName}`}
                    disabled={busy || !p.available}
                    variant="secondary"
                    onClick={() => {
                      setBusy(true);
                      setActionError('');
                      void openPlan(p)
                        .catch((e) => setActionError(messageOf(e)))
                        .finally(() => setBusy(false));
                    }}
                  />
                  {p.lastCourseId && p.available && (
                    <ActionButton
                      label={`继续最近课程：${p.taskName}`}
                      variant="link"
                      onClick={() =>
                        void Taro.navigateTo({
                          url: `/pages/course/index?planId=${p.id}&courseId=${encodeURIComponent(p.lastCourseId!)}`,
                        })
                      }
                    />
                  )}
                </View>
              ))}
            </View>
          ))}
          {data.total === 0 && (
            <View className="card">
              <Text className="row-title">你的第一条学习路径，还没开始。</Text>
              <Text className="description">
                导入一个目标岗位，或选一个现在就想学会的任务。
              </Text>
            </View>
          )}
          {data.total > 20 && (
            <>
              <ActionButton
                label="上一页任务"
                disabled={page === 1}
                variant="link"
                onClick={() => setPage(page - 1)}
              />
              <ActionButton
                label="下一页任务"
                disabled={page * 20 >= data.total}
                variant="link"
                onClick={() => setPage(page + 1)}
              />
            </>
          )}
        </>
      )}
      <Text className="row-title">最近岗位分析</Text>
      {!analyses.data ? (
        <LoadState error={analyses.error} retry={analyses.reload} />
      ) : analyses.data.items.length === 0 ? (
        <Text className="description">
          还没有岗位分析，可以直接从任务开始。
        </Text>
      ) : (
        <>
          <Text className="catalog-count">
            第{analysisPage}页 · 共{analyses.data.total}次分析 ·
            未选任务的方向继续保存在原分析中
          </Text>
          {analyses.data.items.map((a) => (
            <View className="card" key={a.id}>
              <Text className="row-title">{a.input.title || '未命名岗位'}</Text>
              <Text className="description">
                {a.status === 'succeeded'
                  ? `已确认 ${a.selectedScenes.length} 个方向，可继续选任务`
                  : a.status === 'failed'
                    ? '分析失败，可回到输入重新尝试'
                    : a.status === 'cancelled'
                      ? '已取消'
                      : '分析处理中，可继续查看状态'}
              </Text>
              <ActionButton
                label={`继续岗位分析：${a.input.title || '未命名岗位'}`}
                variant="link"
                onClick={() =>
                  void Taro.navigateTo({
                    url: `/pages/analysis/index?analysisJobId=${a.id}`,
                  })
                }
              />
            </View>
          ))}
        </>
      )}
      {analyses.data && analyses.data.total > 20 && (
        <>
          <ActionButton
            label="上一页分析"
            disabled={analysisPage === 1}
            variant="link"
            onClick={() => setAnalysisPage(analysisPage - 1)}
          />
          <ActionButton
            label="下一页分析"
            disabled={analysisPage * 20 >= analyses.data.total}
            variant="link"
            onClick={() => setAnalysisPage(analysisPage + 1)}
          />
        </>
      )}
      {actionError && <Text className="error">{actionError}</Text>}
      <ActionButton
        label="从目标岗位开始"
        onClick={() => void Taro.navigateTo({ url: '/pages/jd/index' })}
      />
      <View className="action-gap" />
      <ActionButton
        label="添加学习任务"
        variant="secondary"
        onClick={() => void Taro.switchTab({ url: '/pages/catalog/index' })}
      />
    </View>
  );
}
