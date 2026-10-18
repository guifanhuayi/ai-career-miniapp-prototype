import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import type {
  ApiBody,
  ApiResult,
} from '../../../../../packages/contracts/client';
import {
  formatDuration,
  type Level,
  levelNames,
} from '../../../../../packages/domain/src';
import ActionButton from '../../components/ActionButton';
import Choice from '../../components/Choice';
import CourseVideo from '../../components/CourseVideo';
import type { VideoControls } from '../../components/CourseVideo/types';
import LoadState from '../../components/LoadState';
import { apiOrigin, guestApi } from '../../services/api';
import { learningUrl, messageOf } from '../../services/learning';
import { useResource } from '../../services/useResource';

export default function Course() {
  const q = Taro.useRouter().params;
  const planId = q.planId ?? '';
  const courseId = q.courseId ?? '';
  const path = { planId, courseId };
  const identity = `${planId}:${courseId}`;
  const { data, setData, error, reload } = useResource(async () => {
    const [course, plan] = await Promise.all([
      guestApi('getLearningCourse', { path }),
      guestApi('getLearningPlan', { path: { planId } }),
    ]);
    return { ...course, plan };
  }, identity);
  const [playError, setPlayError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [markError, setMarkError] = useState('');
  const [markBusy, setMarkBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const controls = useRef<VideoControls>();
  const position = useRef(0);
  const ended = useRef(false);
  const dirty = useRef(false);
  const progress = useRef<ApiResult<'getLearningCourse'>['progress']>();
  const saving = useRef(Promise.resolve());
  const lastSave = useRef(0);
  const visible = useRef(true);
  const pendingKey = `career.progress.pending.v1.${identity}`;
  useEffect(() => {
    if (data) {
      progress.current = data.progress;
      position.current = data.progress.position;
      ended.current = data.progress.clientEnded;
      dirty.current = false;
      setPlayError('');
      setReady(false);
    }
  }, [data?.course.id, data?.progress.revision]);
  const save = () => {
    if (!progress.current || !data || !dirty.current) return;
    const desired = {
      position: Math.min(position.current, data.course.durationSeconds ?? 0),
      clientEnded: ended.current,
    };
    dirty.current = false;
    saving.current = saving.current.then(async () => {
      const send = async (body: ApiBody<'saveCourseProgress'>) => {
        const result = await guestApi('saveCourseProgress', { path, body });
        progress.current = result;
        Taro.removeStorageSync(pendingKey);
      };
      try {
        const stored: unknown = Taro.getStorageSync(pendingKey);
        if (
          stored &&
          typeof stored === 'object' &&
          'idempotencyKey' in stored
        ) {
          const body = stored as ApiBody<'saveCourseProgress'>;
          if (body.mediaVersion === progress.current!.mediaVersion)
            await send(body);
          else Taro.removeStorageSync(pendingKey);
        }
        const body: ApiBody<'saveCourseProgress'> = {
          ...desired,
          revision: progress.current!.revision,
          mediaVersion: progress.current!.mediaVersion,
          idempotencyKey: `progress-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        };
        Taro.setStorageSync(pendingKey, body);
        await send(body);
        setSaveError('');
      } catch (e) {
        dirty.current = true;
        setSaveError(`播放位置未保存：${messageOf(e)}`);
      }
    });
  };
  Taro.useDidShow(() => {
    visible.current = true;
  });
  Taro.useDidHide(() => {
    visible.current = false;
    controls.current?.pause();
    save();
  });
  Taro.useUnload(() => {
    visible.current = false;
    controls.current?.pause();
    save();
  });
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        visible.current &&
        dirty.current &&
        Date.now() - lastSave.current >= 15000
      ) {
        lastSave.current = Date.now();
        save();
      }
    }, 1000);
    return () => clearInterval(timer);
  });
  const mark = async () => {
    if (!data || markBusy) return;
    setMarkBusy(true);
    setMarkError('');
    try {
      const result = await guestApi(
        data.marked ? 'unmarkCourse' : 'markCourse',
        { path: { courseId } },
      );
      setData({ ...data, marked: result.marked });
    } catch (e) {
      setMarkError(messageOf(e));
    } finally {
      setMarkBusy(false);
    }
  };
  if (!data)
    return (
      <View className="page">
        <LoadState error={error} retry={reload} />
        <ActionButton
          label="返回分级课程"
          variant="link"
          onClick={() =>
            void Taro.redirectTo({ url: learningUrl('path', planId) })
          }
        />
      </View>
    );
  const c = data.course;
  const courseLevel = (
    c.mappings.find(
      (m) =>
        m.taskId === data.plan.taskId && m.level === data.plan.selectedLevel,
    ) ?? c.mappings.find((m) => m.taskId === data.plan.taskId)
  )?.level as Level | undefined;
  let start = 0;
  const chapters = c.chapters.map((chapter) => {
    const item = { ...chapter, start };
    start += chapter.durationSeconds;
    return item;
  });
  const validChapters =
    chapters.length > 0 && Math.abs(start - (c.durationSeconds ?? 0)) <= 0.25;
  return (
    <View className="page">
      <Text className="eyebrow">
        课程详情 · {formatDuration(c.durationSeconds ?? 0)}
      </Text>
      <Choice
        className="choice course-cover"
        label="点击封面播放本课"
        disabled={!ready || !!playError}
        onClick={() => controls.current?.play()}
      >
        {c.title} · ▶
      </Choice>
      <Text className="title course-title">{c.title}</Text>
      <Text className="description">
        {c.author} · {c.isTest ? '自制测试资源，非教学课程' : '授权课程'}
      </Text>
      <Text className="catalog-count">
        内容版本 {c.version} ·{' '}
        {c.publishedAt
          ? `发布于 ${c.publishedAt.slice(0, 10)}（UTC）`
          : '尚无发布时间'}
      </Text>
      {playError ? (
        <View className="card">
          <Text className="error">{playError}</Text>
          <ActionButton label="重新加载课程" onClick={reload} />
        </View>
      ) : (
        <CourseVideo
          key={`${identity}:${data.progress.mediaVersion}`}
          src={apiOrigin + c.mediaPath}
          startPosition={data.progress.position}
          onReady={(value) => {
            controls.current = value;
            setReady(true);
          }}
          onPlay={() => {
            if (!visible.current) controls.current?.pause();
          }}
          onTime={(value) => {
            if (Number.isFinite(value)) {
              position.current = value;
              dirty.current = true;
              ended.current = false;
            }
          }}
          onPause={(value) => {
            position.current = value;
            dirty.current = true;
            save();
          }}
          onEnded={(value) => {
            position.current = value;
            ended.current = true;
            dirty.current = true;
            save();
          }}
          onError={() => {
            setPlayError(
              '视频暂时无法播放，请检查本地媒体后重试；不会自动标记看过。',
            );
            controls.current = undefined;
            setReady(false);
          }}
        />
      )}
      <Text className="catalog-count">
        记录最近播放位置，拖动或播放结束不代表认证完课；“看过”由你手动标记。
      </Text>
      {courseLevel && (
        <View className="card">
          <Text className="row-title">你将学到</Text>
          {data.plan.syllabus[courseLevel].map((topic) => (
            <Text className="description" key={topic}>
              · {topic}
            </Text>
          ))}
          <Text className="row-title">适合谁学习</Text>
          <Text className="description">
            希望完成“{data.plan.taskName}”的大学生，本课对应
            {levelNames[courseLevel]}学习路径。
            {courseLevel === 'beginner'
              ? '无需相关任务经验。'
              : courseLevel === 'intermediate'
                ? '建议已掌握该场景的基本概念与操作。'
                : '建议已有独立完成任务的经验。'}
          </Text>
        </View>
      )}
      <Text className="row-title">课程目录</Text>
      {chapters.length === 0 && (
        <Text className="description">
          本课程暂未提供分段目录，可直接播放完整视频。
        </Text>
      )}
      {chapters.map((chapter, i) => (
        <View className="chapter" key={`${chapter.start}:${chapter.title}`}>
          <Text className="row-title">
            {i + 1}. {chapter.title}
          </Text>
          <Text className="description">
            {formatDuration(chapter.durationSeconds)}
          </Text>
          {validChapters && (
            <ActionButton
              label={`跳到章节${i + 1}`}
              variant="link"
              disabled={!ready || !!playError}
              onClick={() => controls.current?.seek(chapter.start)}
            />
          )}
        </View>
      ))}
      {saveError && (
        <>
          <Text className="error">{saveError}</Text>
          <ActionButton
            label="重试保存位置"
            variant="secondary"
            onClick={() => {
              dirty.current = true;
              save();
            }}
          />
        </>
      )}
      {markError && <Text className="error">{markError}</Text>}
      <ActionButton
        label={data.marked ? '已标记看过 · 点击取消' : '手动标记看过'}
        variant="secondary"
        loading={markBusy}
        disabled={markBusy || !!playError}
        onClick={() => void mark()}
      />
      <Text className="description">
        来源与授权：{c.authorization || '尚未配置'}
      </Text>
      {c.sourceUrl && (
        <Text className="source-text">来源网页：{c.sourceUrl}</Text>
      )}
      <ActionButton
        label="播放这门课程"
        disabled={!ready || !!playError}
        onClick={() => controls.current?.play()}
      />
      <View className="action-gap" />
      <ActionButton
        label="返回分级课程"
        onClick={() =>
          void Taro.redirectTo({ url: learningUrl('path', planId) })
        }
      />
    </View>
  );
}
