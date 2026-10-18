import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { type Level, levelNames } from '../../../../../packages/domain/src';
import ActionButton from '../../components/ActionButton';
import LoadState from '../../components/LoadState';
import ReviewDialog from '../../components/ReviewDialog';
import { usePageView } from '../../services/analytics';
import { guestApi } from '../../services/api';
import { learningUrl, messageOf, startAttempt } from '../../services/learning';
import { useResource } from '../../services/useResource';

export default function Result() {
  usePageView();
  const id = Taro.useRouter().params.attemptId ?? '';
  const {
    data: a,
    error,
    reload,
  } = useResource(
    () => guestApi('getAssessmentAttempt', { path: { attemptId: id } }),
    id,
  );
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  if (!a)
    return (
      <View className="page">
        <LoadState error={error} retry={reload} />
      </View>
    );
  if (a.status !== 'submitted')
    return (
      <View className="page">
        <Text className="title">本轮测验尚未提交</Text>
        <ActionButton
          label="继续答题"
          onClick={() =>
            void Taro.redirectTo({ url: `/pages/quiz/index?attemptId=${id}` })
          }
        />
      </View>
    );
  const retake = async () => {
    setBusy(true);
    setActionError('');
    try {
      const next = await startAttempt(a.planId);
      await Taro.navigateTo({ url: `/pages/quiz/index?attemptId=${next.id}` });
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="page">
      <Text className="eyebrow">建议学习起点</Text>
      <Text className="title">
        {a.isMock ? '模拟建议：' : '建议：'}从
        {levelNames[a.recommendedLevel as Level]}内容开始
      </Text>
      {a.isMock && (
        <Text className="catalog-count">
          模拟测验，仅验证学习流程，可自主调整。
        </Text>
      )}
      <View className="result-dim card">
        <View>
          <Text className="title">{a.score} / 4</Text>
          <Text className="description">本次答对题数</Text>
        </View>
        <View>
          <Text className="title">
            {levelNames[a.recommendedLevel as Level]}
          </Text>
          <Text className="description">本轮推荐等级</Text>
        </View>
      </View>
      <Text className="description">
        {a.isMock ? '4 道模拟题' : '本次小测'}
        仅作学习起点参考，不是专业能力认证。课程页可以自主切换等级；重测不会删除历史结果。
      </Text>
      <ActionButton
        label="查看分级课程"
        onClick={() =>
          void Taro.navigateTo({ url: learningUrl('path', a.planId) })
        }
      />
      <ActionButton
        label="查看答题回顾"
        variant="link"
        onClick={() => setReview(!review)}
      />
      {review && (
        <ReviewDialog onClose={() => setReview(false)}>
          {a.questions.map((q, i) => (
            <View className="card" key={q.id}>
              <Text className="row-title">
                {i + 1}. {q.title}
              </Text>
              <Text className="description">
                你的选择：{q.answer == null ? '未选择' : q.options[q.answer]}
              </Text>
              <Text className="green">
                参考答案：{q.correct == null ? '' : q.options[q.correct]}
              </Text>
              <Text className="description">{q.explanation}</Text>
            </View>
          ))}
        </ReviewDialog>
      )}
      {actionError && <Text className="error">{actionError}</Text>}
      <ActionButton
        label="重新测验"
        variant="secondary"
        loading={busy}
        disabled={busy}
        onClick={() => void retake()}
      />
      <Text className="catalog-count">
        题库：{a.questionVersion} · 规则：{a.scoringVersion} · 第{a.sequence}轮
      </Text>
    </View>
  );
}
