import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import {
  formatDuration,
  type Level,
  levelNames,
  levels,
} from '../../../../../packages/domain/src';
import ActionButton from '../../components/ActionButton';
import Choice from '../../components/Choice';
import LoadState from '../../components/LoadState';
import { track, usePageView } from '../../services/analytics';
import { api, guestApi } from '../../services/api';
import { messageOf, startAttempt } from '../../services/learning';
import { useResource } from '../../services/useResource';

export default function Path() {
  usePageView();
  const id = Taro.useRouter().params.planId ?? '';
  const [page, setPage] = useState(1);
  const { data, error, reload } = useResource(async () => {
    const plan = await guestApi('getLearningPlan', { path: { planId: id } });
    const courses =
      plan.selectedLevel && plan.available
        ? await api('listCourses', {
            query: {
              taskId: plan.taskId,
              level: plan.selectedLevel as Level,
              page,
              pageSize: 20,
            },
          })
        : undefined;
    return { plan, courses };
  }, `${id}:${page}`);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data?.plan.available && data.plan.selectedLevel && data.courses) {
      if (data.courses.items.length) {
        for (const course of data.courses.items)
          track('recommendation_viewed', {
            planId: data.plan.id,
            courseId: course.id,
          });
      } else track('recommendation_viewed', { planId: data.plan.id });
    }
  }, [data]);
  const [actionError, setActionError] = useState('');
  const choose = async (level: Level) => {
    if (!data || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await guestApi('updateLearningLevel', {
        path: { planId: id },
        body: { revision: data.plan.revision, selectedLevel: level },
      });
      setPage(1);
      reload();
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const retake = async () => {
    setBusy(true);
    setActionError('');
    try {
      const a = await startAttempt(id);
      await Taro.navigateTo({ url: `/pages/quiz/index?attemptId=${a.id}` });
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <View className="page">
        <LoadState error={error} retry={reload} />
      </View>
    );
  const { plan: p, courses } = data;
  const level = p.selectedLevel as Level | null;
  const openCourse = (courseId: string) =>
    Taro.navigateTo({
      url: `/pages/course/index?planId=${encodeURIComponent(id)}&courseId=${encodeURIComponent(courseId)}`,
    });
  return (
    <View className="page">
      <Text className="eyebrow">YOUR LEARNING PATH</Text>
      <Text className="title">{p.sceneName}</Text>
      <Text className="title green">从这里学起。</Text>
      <Text className="description">目标任务：{p.taskName}</Text>
      {!p.available ? (
        <Text className="error">
          任务已下架，历史记录仍保留，暂不能继续课程。
        </Text>
      ) : !level ? (
        <ActionButton
          label="开始能力小测"
          disabled={busy}
          onClick={() => void retake()}
        />
      ) : (
        <>
          <View className="mode-switch">
            {levels.map((value) => (
              <Choice
                key={value}
                className="choice mode-choice"
                label={`切换${levelNames[value]}`}
                selected={level === value}
                disabled={busy}
                onClick={() => void choose(value)}
              >
                {levelNames[value]}
              </Choice>
            ))}
          </View>
          <Text className="catalog-count">
            本轮推荐：{levelNames[p.recommendedLevel as Level]} · 当前自主选择：
            {levelNames[level]}
          </Text>
          <View className="card">
            <Text className="row-title">这一阶段，需要学什么？</Text>
            {p.syllabus[level].map((topic) => (
              <Text key={topic} className="description">
                · {topic}
              </Text>
            ))}
          </View>
          <Text className="row-title">为你推荐的课程</Text>
          <Text className="catalog-count">
            总时长 35 分钟以内 · 显示实际时长
          </Text>
          {courses?.items.map((c) => (
            <View className="card" key={c.id}>
              <Choice
                className="choice course-cover"
                label={`打开课程封面：${c.title}`}
                onClick={() => void openCourse(c.id)}
              >
                {p.sceneName} · {levelNames[level]} · ▶
              </Choice>
              <Text className="row-title">{c.title}</Text>
              <Text className="description">
                {c.author} · {formatDuration(c.durationSeconds ?? 0)}
                {c.isTest ? ' · 自制测试视频，非教学课程' : ''}
              </Text>
              <ActionButton
                label={`查看课程：${c.title}`}
                variant="secondary"
                onClick={() => void openCourse(c.id)}
              />
              <Text className="catalog-count">
                内容版本 {c.version} ·{' '}
                {c.publishedAt
                  ? `发布于 ${c.publishedAt.slice(0, 10)}（UTC）`
                  : '尚无发布时间'}
              </Text>
            </View>
          ))}
          {courses?.items.length === 0 && (
            <View className="card">
              <Text className="description">
                当前等级暂无已发布课程，可以切换等级或稍后再来。
              </Text>
            </View>
          )}
          {courses && courses.items[0] && (
            <ActionButton
              label="开始当前列表第一课"
              onClick={() => void openCourse(courses.items[0]!.id)}
            />
          )}
          {courses && courses.total > 20 && (
            <View className="action-gap">
              <Text className="catalog-count">
                第{page}页 · 共{courses.total}门
              </Text>
              <ActionButton
                label="上一页课程"
                disabled={page === 1}
                variant="link"
                onClick={() => setPage(page - 1)}
              />
              <ActionButton
                label="下一页课程"
                disabled={page * 20 >= courses.total}
                variant="link"
                onClick={() => setPage(page + 1)}
              />
            </View>
          )}
          <View className="deliverable">
            <Text className="row-title">学完后，尝试独立完成</Text>
            <Text className="description">{p.output}</Text>
          </View>
        </>
      )}
      {actionError && <Text className="error">{actionError}</Text>}
      {p.latestAttemptId && (
        <ActionButton
          label="查看最近一次测验"
          variant="link"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/${p.latestAttemptStatus === 'draft' ? 'quiz' : 'result'}/index?attemptId=${p.latestAttemptId}`,
            })
          }
        />
      )}
      <ActionButton
        label="查看我的其他学习任务"
        variant="link"
        onClick={() => void Taro.switchTab({ url: '/pages/plans/index' })}
      />
    </View>
  );
}
