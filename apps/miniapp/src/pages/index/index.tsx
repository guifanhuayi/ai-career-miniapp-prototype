import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { prototypeIcons } from '../../assets/prototype-icons';
import fallbackIcon from '../../assets/prototype-icons/spark.png';
import ActionButton from '../../components/ActionButton';
import Choice from '../../components/Choice';
import LoadState from '../../components/LoadState';
import { usePageView } from '../../services/analytics';
import { api } from '../../services/api';
import { useResource } from '../../services/useResource';

export default function Home() {
  usePageView();
  const { data, error, reload } = useResource(
    () => api('listScenes', { query: { pageSize: 100 } }),
    'home',
  );
  const featured = ['prompt', 'ppt', 'data', 'resume'].flatMap(
    (id) => data?.items.filter((s) => s.id === id) ?? [],
  );
  return (
    <View className="page home-page">
      <Text className="eyebrow">百年前程 · 大学生 AI 学习</Text>
      <Text className="title">学一点 AI，</Text>
      <Text className="title">
        离理想岗位<Text className="green">近一点。</Text>
      </Text>
      <Text className="description">
        不用先弄懂所有术语。{'\n'}从一个岗位，或一个想完成的任务开始。
      </Text>
      <View className="hero">
        <Text className="eyebrow">YOUR NEXT STEP</Text>
        <Text className="title">岗位需要什么，</Text>
        <Text className="title">你就从哪里开始。</Text>
        <Text className="description">上传目标岗位，找到你的 AI 学习方向</Text>
        <ActionButton
          label="解析我的岗位"
          onClick={() => void Taro.navigateTo({ url: '/pages/jd/index' })}
        />
      </View>
      <Text className="catalog-count">
        按岗位匹配 · 按任务学习 · 按水平推荐
      </Text>
      <View className="section-head">
        <Text className="row-title">先从一个场景开始</Text>
        <ActionButton
          label="查看学习方向目录"
          variant="link"
          onClick={() => void Taro.switchTab({ url: '/pages/catalog/index' })}
        />
      </View>
      {!data ? (
        <LoadState error={error} retry={reload} />
      ) : (
        <View className="scene-grid">
          {featured.map((scene) => (
            <Choice
              className="choice scene-tile"
              key={scene.id}
              label={`选择${scene.name}`}
              onClick={() =>
                void Taro.navigateTo({
                  url: `/pages/scene/index?sceneId=${encodeURIComponent(scene.id)}`,
                })
              }
            >
              <Image
                className="line-icon"
                src={prototypeIcons[scene.icon] ?? fallbackIcon}
              />
              <Text className="row-title">{scene.name}</Text>
              <Text className="catalog-count">{scene.description}</Text>
            </Choice>
          ))}
        </View>
      )}
      <View className="deliverable">
        <Text className="row-title">找到适合自己的学习起点</Text>
        <Text className="description">初阶打基础，进阶做任务，高阶跟前沿</Text>
      </View>
      <ActionButton
        label="我的学习"
        variant="secondary"
        onClick={() => void Taro.switchTab({ url: '/pages/plans/index' })}
      />
    </View>
  );
}
