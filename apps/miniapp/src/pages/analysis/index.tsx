import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import type { ApiResult } from '../../../../../packages/contracts/client';
import ActionButton from '../../components/ActionButton';
import Choice from '../../components/Choice';
import { guestApi } from '../../services/api';
import {
  activeAnalysisKey,
  clientId,
  failureText,
} from '../../services/jd-drafts';

type Analysis = ApiResult<'getAnalysisJob'>;
const pending = (data: Analysis) => ['queued', 'running'].includes(data.status);
export default function AnalysisPage() {
  const id = Taro.useRouter().params.analysisJobId ?? '';
  const [data, setData] = useState<Analysis>();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(true);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const alive = useRef(true);
  const lock = useRef(false);
  Taro.useDidShow(() => {
    alive.current = true;
    setVisible(true);
  });
  Taro.useDidHide(() => {
    alive.current = false;
    setVisible(false);
    epoch.current++;
  });
  useEffect(
    () => () => {
      alive.current = false;
      epoch.current++;
    },
    [],
  );
  useEffect(() => {
    if (!visible) return;
    const generation = ++epoch.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError('');
    const load = async () => {
      try {
        const next = await guestApi('getAnalysisJob', {
          path: { analysisJobId: id },
        });
        if (epoch.current !== generation || !alive.current) return;
        setData(next);
        setSelected(next.selectedScenes);
        if (pending(next)) timer = setTimeout(() => void load(), 1000);
      } catch (failure) {
        if (epoch.current === generation && alive.current)
          setError(failureText(failure));
      }
    };
    void load();
    return () => {
      epoch.current++;
      clearTimeout(timer);
    };
  }, [id, visible, reload]);
  const action = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      if (alive.current) setError(failureText(failure));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const cancel = () =>
    void action(async () => {
      await guestApi('cancelAnalysisJob', {
        path: { analysisJobId: id },
        body: { status: 'cancelled' },
      });
      if (alive.current) setReload((value) => value + 1);
    });
  const retry = () =>
    void action(async () => {
      if (!data) return;
      const key = `career.jd.retry.${id}`;
      const saved: unknown = Taro.getStorageSync(key);
      const idempotencyKey =
        typeof saved === 'string' && saved ? saved : clientId();
      Taro.setStorageSync(key, idempotencyKey);
      const next = await guestApi('createAnalysisJob', {
        body: {
          jobDescriptionId: data.jobDescriptionId,
          flowId: data.flowId,
          idempotencyKey,
        },
      });
      if (!alive.current) return;
      Taro.setStorageSync(activeAnalysisKey, next.id);
      await Taro.redirectTo({
        url: `/pages/analysis/index?analysisJobId=${encodeURIComponent(next.id)}`,
      });
    });
  const confirm = () =>
    void action(async () => {
      if (!data || !selected.length) return;
      const next = await guestApi('saveAnalysisSelection', {
        path: { analysisJobId: id },
        body: { revision: data.revision, sceneIds: selected },
      });
      if (!alive.current) return;
      setData(next);
      await Taro.navigateTo({
        url: `/pages/scene/index?sceneId=${encodeURIComponent(selected[0] ?? '')}&analysisJobId=${encodeURIComponent(id)}`,
      });
    });
  return (
    <View className="page">
      <Text className="eyebrow">从岗位到学习 · 能力匹配</Text>
      <Text className="title">
        {!data || pending(data)
          ? '正在梳理岗位要求'
          : data.status === 'succeeded'
            ? '从这些方向开始'
            : data.status === 'cancelled'
              ? '本次分析已取消'
              : '本次分析未完成'}
      </Text>
      <Text className="description">
        本地规则模拟分析，未接入真实AI服务。只依据你确认的文字提供学习起点建议。
      </Text>
      {error && (
        <View className="card">
          <Text className="error">{error}</Text>
          <ActionButton
            label="重新读取分析"
            variant="secondary"
            onClick={() => setReload((value) => value + 1)}
          />
        </View>
      )}
      {data && (
        <>
          <View className="card">
            <Text className="row-title job-heading">
              {data.input.title || '我的目标岗位'}
            </Text>
            <Text className="source-text">{data.input.text}</Text>
          </View>
          {pending(data) && (
            <View className="card">
              <Text className="description">
                {data.status === 'queued'
                  ? '任务已排队，确认的岗位文字已保存。'
                  : '正在匹配岗位原文与学习方向，请稍候。'}
                可离开页面，稍后恢复这次分析。
              </Text>
              <ActionButton
                label="取消本次分析"
                variant="secondary"
                loading={busy}
                disabled={busy}
                onClick={cancel}
              />
            </View>
          )}
          {['failed', 'cancelled'].includes(data.status) && (
            <View className="card">
              <Text className="description">
                已确认的文字和以往学习记录保留。可以重试，或返回修改岗位文字。
              </Text>
              <ActionButton
                label="重新分析这段文字"
                loading={busy}
                disabled={busy}
                onClick={retry}
              />
            </View>
          )}
          {data.status === 'succeeded' && (
            <>
              {data.items.length === 0 && (
                <Text className="description">
                  本次暂未找到可推荐的已发布方向，岗位原文已保存。可浏览全部学习方向，或返回修改文字。
                </Text>
              )}
              <Text className="description">
                选择与你目标相关的方向。每个方向还需要选择具体任务，不会自动生成成绩或任务。
              </Text>
              {data.items.map((item) => (
                <Choice
                  key={item.sceneId}
                  label={`选择${item.sceneName}`}
                  selected={selected.includes(item.sceneId)}
                  disabled={busy}
                  onClick={() =>
                    setSelected((current) =>
                      current.includes(item.sceneId)
                        ? current.filter((value) => value !== item.sceneId)
                        : [...current, item.sceneId],
                    )
                  }
                >
                  <View className="catalog-body">
                    <Text className="row-title">{item.sceneName}</Text>
                    <Text className="catalog-count">
                      {item.kind === 'direct'
                        ? '岗位原文依据'
                        : '延伸学习建议 · 岗位未明确要求'}
                    </Text>
                    {item.kind === 'direct' && (
                      <Text className="evidence-quote">{item.quote}</Text>
                    )}
                  </View>
                </Choice>
              ))}
              <Text className="catalog-count">
                已选 {selected.length} 个方向
              </Text>
              {selected.length > 0 && (
                <Text className="description">
                  下一步进入“
                  {
                    data.items.find((item) => item.sceneId === selected[0])
                      ?.sceneName
                  }
                  ”选择具体任务。其他方向会保留，可返回本次分析继续选择。
                </Text>
              )}
              <View className="action-gap">
                <ActionButton
                  label="确认方向，选择具体任务"
                  loading={busy}
                  disabled={busy || !selected.length}
                  onClick={confirm}
                />
              </View>
            </>
          )}
        </>
      )}
      <View className="action-gap">
        <ActionButton
          label="返回岗位输入"
          variant="secondary"
          disabled={busy}
          onClick={() => void Taro.navigateTo({ url: '/pages/jd/index' })}
        />
      </View>
      <View className="action-gap">
        <ActionButton
          label="浏览全部学习方向"
          variant="link"
          disabled={busy}
          onClick={() => void Taro.navigateTo({ url: '/pages/catalog/index' })}
        />
      </View>
    </View>
  );
}
