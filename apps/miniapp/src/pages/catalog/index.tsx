import { Image, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import type { ApiResult } from '../../../../../packages/contracts/client';
import { sceneCategories } from '../../../../../packages/domain/src';
import { prototypeIcons } from '../../assets/prototype-icons';
import fallbackIcon from '../../assets/prototype-icons/spark.png';
import ActionButton from '../../components/ActionButton';
import Choice from '../../components/Choice';
import { api } from '../../services/api';

const categories = ['全部', ...sceneCategories] as const;
export default function Catalog() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('全部');
  const [data, setData] = useState<ApiResult<'listScenes'>>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const id = ++sequence.current;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      void api('listScenes', {
        query: {
          search: search.trim(),
          ...(category === '全部' ? {} : { category }),
          pageSize: 100,
        },
      })
        .then((result) => {
          if (id === sequence.current) setData(result);
        })
        .catch(() => {
          if (id === sequence.current) {
            setData(undefined);
            setError('学习方向暂时加载失败，请重试。');
          }
        })
        .finally(() => {
          if (id === sequence.current) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ++sequence.current;
    };
  }, [search, category, retry]);
  return (
    <View className="page catalog-page">
      <Text className="eyebrow">LEARN WITH A PURPOSE</Text>
      <Text className="title">从一个任务，</Text>
      <Text className="title green">找到你的学习方向。</Text>
      <Text className="description">先选想学的，再找到适合你的难度。</Text>
      <View className="searchbox">
        <Input
          ariaLabel="搜索技能或任务"
          placeholder="搜索技能或任务，例如 PPT、简历、API"
          value={search}
          maxlength={100}
          onInput={(event) => setSearch(event.detail.value)}
        />
      </View>
      <View className="chips">
        {categories.map((value) => (
          <Choice
            key={value}
            className="chip"
            label={value}
            selected={category === value}
            onClick={() => setCategory(value)}
          >
            {value}
          </Choice>
        ))}
      </View>
      {loading ? (
        <Text className="description">正在查找学习方向…</Text>
      ) : error ? (
        <View className="card">
          <Text className="error">{error}</Text>
          <ActionButton
            label="重新加载方向"
            onClick={() => setRetry((value) => value + 1)}
          />
        </View>
      ) : (
        <>
          <Text className="catalog-count">
            {data?.total ?? 0} 个学习方向 · 每个方向包含 3 个等级
          </Text>
          {data?.items.map((scene) => (
            <Choice
              key={scene.id}
              className="catalog-row"
              label={`查看${scene.name}`}
              onClick={() =>
                void Taro.navigateTo({
                  url: `/pages/scene/index?sceneId=${encodeURIComponent(scene.id)}`,
                })
              }
            >
              <View className="tile-icon">
                <Image
                  src={prototypeIcons[scene.icon] ?? fallbackIcon}
                  className="line-icon"
                  mode="aspectFit"
                />
              </View>
              <View className="catalog-body">
                <Text className="row-title">{scene.name}</Text>
                <Text className="description">{scene.description}</Text>
                <Text className="catalog-count">
                  {scene.taskCount} 个任务 · 初阶 / 进阶 / 高阶
                </Text>
              </View>
              <Text className="row-arrow">›</Text>
            </Choice>
          ))}
          {data?.total === 0 && (
            <View className="card">
              <Text className="row-title">暂时没有匹配的方向</Text>
              <Text className="description">
                试试更短的关键词，或清除分类后重新查找。
              </Text>
              <ActionButton
                label="清除筛选"
                onClick={() => {
                  setSearch('');
                  setCategory('全部');
                }}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}
