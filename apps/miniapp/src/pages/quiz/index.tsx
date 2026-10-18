import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import ActionButton from '../../components/ActionButton';
import Choice from '../../components/Choice';
import LoadState from '../../components/LoadState';
import { usePageView } from '../../services/analytics';
import { guestApi } from '../../services/api';
import { messageOf, operationKey } from '../../services/learning';
import { useResource } from '../../services/useResource';

export default function Quiz() {
  usePageView();
  const id = Taro.useRouter().params.attemptId ?? '';
  const {
    data: a,
    setData,
    error,
    setError,
    reload,
  } = useResource(
    () => guestApi('getAssessmentAttempt', { path: { attemptId: id } }),
    id,
  );
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    if (a?.status === 'submitted')
      void Taro.redirectTo({ url: `/pages/result/index?attemptId=${id}` });
  }, [a?.status, id]);
  useEffect(() => {
    setIndex(0);
  }, [id]);
  const save = async (option: number) => {
    if (!a || busy) return;
    const q = a.questions[index];
    if (!q) return;
    setBusy(true);
    setActionError('');
    try {
      setData(
        await guestApi('saveAssessmentAnswer', {
          path: { attemptId: id, questionId: q.id },
          body: { revision: a.revision, option },
        }),
      );
    } catch (e) {
      setActionError(messageOf(e));
      try {
        setData(
          await guestApi('getAssessmentAttempt', { path: { attemptId: id } }),
        );
      } catch (e2) {
        setError(messageOf(e2));
      }
    } finally {
      setBusy(false);
    }
  };
  const next = async () => {
    if (!a || busy || a.questions[index]?.answer == null) return;
    if (index < a.questions.length - 1) {
      setIndex(index + 1);
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      await guestApi('submitAssessmentAttempt', {
        path: { attemptId: id },
        body: { idempotencyKey: operationKey(`submit-${id}`) },
      });
      await Taro.redirectTo({ url: `/pages/result/index?attemptId=${id}` });
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  if (!a)
    return (
      <View className="page">
        <LoadState error={error} retry={reload} />
      </View>
    );
  const q = a.questions[index];
  if (!q)
    return (
      <View className="page">
        <LoadState error="测验内容不可用" retry={reload} />
      </View>
    );
  return (
    <View className="page">
      <Text className="eyebrow">
        场景能力小测 · {index + 1} / {a.questions.length}
      </Text>
      <Text className="catalog-count">
        {a.isMock
          ? '模拟题库 · 仅供学习起点参考，非能力认证'
          : '学习起点参考，非能力认证'}
      </Text>
      <Text className="title quiz-question">{q.title}</Text>
      {q.options.map((text, option) => (
        <Choice
          key={text}
          label={`选项${'ABC'[option]}：${text}`}
          selected={q.answer === option}
          disabled={busy}
          onClick={() => void save(option)}
        >
          <Text className="option-letter">{'ABC'[option]}</Text>
          <Text>{text}</Text>
        </Choice>
      ))}
      <Text className="description">
        按真实理解选择。答案保存后可返回修改；不同任务独立测验。
      </Text>
      {actionError && <Text className="error">{actionError}</Text>}
      <ActionButton
        label={index === a.questions.length - 1 ? '提交测验' : '下一题'}
        disabled={busy || q.answer == null}
        loading={busy}
        onClick={() => void next()}
      />
      {index > 0 && (
        <ActionButton
          label="上一题"
          variant="link"
          disabled={busy}
          onClick={() => setIndex(index - 1)}
        />
      )}
      <ActionButton
        label="返回我的学习"
        variant="link"
        disabled={busy}
        onClick={() => void Taro.switchTab({ url: '/pages/plans/index' })}
      />
    </View>
  );
}
