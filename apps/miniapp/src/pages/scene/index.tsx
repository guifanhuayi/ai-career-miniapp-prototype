import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import type { ApiResult } from '../../../../../packages/contracts/client';
import ActionButton from '../../components/ActionButton';
import Choice from '../../components/Choice';
import { api } from '../../services/api';

export default function Scene() {
  const sceneId = Taro.useRouter().params.sceneId ?? '';
  const [scene, setScene] = useState<ApiResult<'getScene'>>();
  const [tasks, setTasks] = useState<ApiResult<'listSceneTasks'>['items']>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setScene(undefined);
    setError('');
    setSelected('');
    void Promise.all([
      api('getScene', { path: { sceneId } }),
      api('listSceneTasks', { path: { sceneId }, query: { pageSize: 100 } }),
    ])
      .then(([item, list]) => {
        if (current) {
          setScene(item);
          setTasks(list.items);
        }
      })
      .catch(() => {
        if (current) setError('该方向暂不可用，请返回目录或重新加载。');
      });
    return () => {
      current = false;
    };
  }, [sceneId, retry]);
  return (
    <View className="page">
      {error ? (
        <View className="card">
          <Text className="error">{error}</Text>
          <ActionButton
            label="重新加载任务"
            onClick={() => setRetry((value) => value + 1)}
          />
        </View>
      ) : !scene ? (
        <Text className="description">正在加载任务…</Text>
      ) : (
        <>
          <Text className="eyebrow">{scene.category}</Text>
          <Text className="title">{scene.name}</Text>
          <Text className="description">
            {scene.description}。选一个最贴近你当前目标的任务。
          </Text>
          <Text className="row-title">你想完成什么？</Text>
          <Text className="catalog-count">单选 · 不同任务独立保存学习记录</Text>
          {tasks.map((task, index) => (
            <Choice
              key={task.id}
              label={`选择${task.name}`}
              selected={selected === task.id}
              onClick={() => setSelected(task.id)}
            >
              <View className="task-radio" />
              <View className="catalog-body">
                <Text className="row-title">{task.name}</Text>
                <Text className="description">
                  {index === 0
                    ? '从常见任务开始，逐步掌握完整方法。'
                    : index === 1
                      ? '围绕实际应用，形成自己的任务成果。'
                      : '结合展示场景，让成果更清晰、更完整。'}
                </Text>
              </View>
            </Choice>
          ))}
          {tasks.length === 0 && (
            <Text className="description">这个方向暂时没有已发布任务。</Text>
          )}
          <View className="deliverable">
            <Text className="row-title">这次学习，目标是完成</Text>
            <Text className="description">{scene.output}</Text>
          </View>
          {selected && (
            <Text className="description">
              已选择：{tasks.find((task) => task.id === selected)?.name}
              。当前为内容目录验收；测验与学习记录将在学习模块接入。
            </Text>
          )}
        </>
      )}
      <ActionButton
        label="返回学习目录"
        onClick={() => {
          if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
          else void Taro.redirectTo({ url: '/pages/catalog/index' });
        }}
      />
    </View>
  );
}
