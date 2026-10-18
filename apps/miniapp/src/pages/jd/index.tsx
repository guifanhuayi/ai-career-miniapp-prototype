import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import sample from '../../../../../packages/domain/fixtures/ocr/mock-jd-v1.json';
import { characterCount, validJd } from '../../../../../packages/domain/src';
import exampleImage from '../../assets/jd-example.png';
import ActionButton from '../../components/ActionButton';
import Choice from '../../components/Choice';
import FormField from '../../components/FormField';
import { usePageView } from '../../services/analytics';
import { guestApi } from '../../services/api';
import { chooseImage, imagePreview, uploadImage } from '../../services/images';
import {
  activeAnalysisKey,
  clientId,
  failureText,
  type JdDraft,
  readDraft,
  saveDraft,
  submitConfirmed,
} from '../../services/jd-drafts';

export default function JobInput() {
  usePageView();
  const query = Taro.useRouter().params;
  const [mode, setMode] = useState<'text' | 'image'>(
    query.mode === 'image' ? 'image' : 'text',
  );
  const [text, setText] = useState(() => readDraft('text'));
  const [image, setImage] = useState(() => readDraft('image'));
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const currentDraft = (target: 'text' | 'image', previous: JdDraft) => {
    const signature = (value: JdDraft) =>
      JSON.stringify([
        value.title,
        value.text,
        value.source,
        value.uploadId ?? '',
        value.ocrId ?? '',
      ]);
    return (
      alive.current && signature(readDraft(target)) === signature(previous)
    );
  };
  Taro.useDidHide(() => {
    alive.current = false;
  });
  Taro.useDidShow(() => {
    alive.current = true;
    setText(readDraft('text'));
    setImage(readDraft('image'));
    if (!lock.current) setBusy(false);
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setPreview('');
    if (!image.uploadId) return;
    let current = true;
    let dispose: (() => void) | undefined;
    void imagePreview(image.uploadId)
      .then((result) => {
        if (!current) {
          result.dispose();
          return;
        }
        setPreview(result.url);
        dispose = result.dispose;
      })
      .catch(() => {
        if (current)
          setError(
            '图片预览不可用或已过期；已保存文字仍保留，请重新选择图片。',
          );
      });
    return () => {
      current = false;
      dispose?.();
    };
  }, [image.uploadId]);
  const update = (next: JdDraft) => {
    if (mode === 'text') setText(next);
    else setImage(next);
    try {
      saveDraft(mode, next);
    } catch {
      setError('本机草稿保存失败，请保留当前页面并稍后重试');
    }
  };
  const task = async (work: () => Promise<void>) => {
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
  const replace = async () => {
    if (!(mode === 'text' ? text.text : image.uploadId || image.text))
      return true;
    return (
      await Taro.showModal({
        title: '替换当前模式的草稿？',
        content: '示例将替换这个模式的当前内容，另一个输入模式的草稿保留。',
        confirmText: '使用示例',
        cancelText: '保留原稿',
      })
    ).confirm;
  };
  const useExample = () =>
    void task(async () => {
      if (!(await replace())) return;
      if (mode === 'text') {
        if (!currentDraft('text', text)) return;
        const next = {
          title: sample.title,
          text: sample.text,
          source: 'example' as const,
        };
        saveDraft('text', next);
        setText(next);
      } else {
        const saved = await uploadImage(exampleImage, clientId(), true);
        if (!currentDraft('image', image)) return;
        const next = {
          title: sample.title,
          text: '',
          source: 'image-manual' as const,
          uploadId: saved.id,
        };
        saveDraft('image', next);
        setImage(next);
      }
    });
  const pick = () =>
    void task(async () => {
      const picked = await chooseImage();
      if (!picked) return;
      if (!picked.size || picked.size > 10 * 1024 * 1024)
        throw new Error('请选择不超过10MiB的非空图片，原有效图片仍保留');
      if (
        image.text &&
        !(
          await Taro.showModal({
            title: '替换当前截图与核对稿？',
            content: '新截图需要重新核对文字；文字输入模式的草稿保留。',
            confirmText: '替换截图',
            cancelText: '保留原稿',
          })
        ).confirm
      )
        return;
      const saved = await uploadImage(picked.path, clientId());
      if (!currentDraft('image', image)) return;
      const next = {
        ...image,
        uploadId: saved.id,
        ocrId: undefined,
        text: '',
        source: 'image-manual' as const,
      };
      saveDraft('image', next);
      if (alive.current) setImage(next);
    });
  const submit = () =>
    void task(async () => {
      if (!validJd(text.text) || characterCount(text.title) > 100)
        throw new Error('请填写有效JD（最多8000字）及不超过100字的岗位名称');
      const result = await submitConfirmed({
        title: text.title,
        text: text.text,
        source: text.source,
      });
      if (result.current && alive.current)
        await Taro.navigateTo({
          url: `/pages/analysis/index?analysisJobId=${result.analysis.id}`,
        });
    });
  const review = () =>
    void task(async () => {
      if (!image.uploadId) throw new Error('请先选择有效图片');
      const result = await guestApi('createOcrJob', {
        body: {
          uploadId: image.uploadId,
          idempotencyKey: `ocr-${image.uploadId}`,
        },
      });
      if (!currentDraft('image', image)) return;
      const next = {
        ...image,
        ocrId: result.id,
        ...(image.ocrId === result.id
          ? {}
          : {
              text: result.text ?? '',
              source:
                result.provider === 'local-fixture'
                  ? ('fixture-confirmed' as const)
                  : ('image-manual' as const),
            }),
      };
      saveDraft('image', next);
      if (alive.current) {
        setImage(next);
        await Taro.navigateTo({
          url: `/pages/review/index?ocrJobId=${result.id}`,
        });
      }
    });
  const draft = mode === 'text' ? text : image;
  const active: unknown = Taro.getStorageSync(activeAnalysisKey);
  return (
    <View className="page">
      <Text className="eyebrow">从岗位找到学习方向</Text>
      <Text className="title">你的目标岗位，</Text>
      <Text className="title">需要哪些AI能力？</Text>
      <Text className="description">
        贴一段招聘要求，或上传岗位截图。分析使用本地规则，结果需要你核对。
      </Text>
      <View className="mode-switch">
        <Choice
          className="mode-choice"
          label="粘贴岗位文字"
          selected={mode === 'text'}
          disabled={busy}
          onClick={() => setMode('text')}
        >
          粘贴岗位文字
        </Choice>
        <Choice
          className="mode-choice"
          label="上传岗位截图"
          selected={mode === 'image'}
          disabled={busy}
          onClick={() => setMode('image')}
        >
          上传岗位截图
        </Choice>
      </View>
      <FormField
        id="job-title"
        label="目标岗位（选填，最多100字）"
        value={draft.title}
        disabled={busy}
        onChange={(title) => update({ ...draft, title })}
        placeholder="例如：新媒体运营实习生"
      />
      {mode === 'text' ? (
        <>
          <FormField
            id="jd-text"
            label="岗位描述 / JD"
            value={text.text}
            disabled={busy}
            multiline
            onChange={(value) => update({ ...text, text: value })}
            placeholder="粘贴岗位职责、任职要求等内容…"
          />
          <Text className="catalog-count">
            {characterCount(text.text)}/8000字
          </Text>
          {text.source === 'example' && (
            <Text className="description">
              示例文字（可编辑），不是你的真实岗位事实；仍需确认提交。
            </Text>
          )}
        </>
      ) : (
        <View className="card">
          {preview && (
            <Image className="jd-preview" src={preview} mode="widthFix" />
          )}
          <Text className="description">
            单张JPG/PNG/WEBP，不超过10MiB。本地未接真实OCR，普通截图需要手工补录；示例截图会明确标为模拟。
          </Text>
          <ActionButton
            label="选择岗位截图"
            variant="secondary"
            disabled={busy}
            onClick={pick}
          />
          {image.uploadId && (
            <Text className="catalog-count">
              当前有效图片已保存；只有核对并确认的文字才进入分析。
            </Text>
          )}
        </View>
      )}
      {error && <Text className="error">{error}</Text>}
      <View className="action-gap">
        <ActionButton
          variant="link"
          label={
            mode === 'text' ? '没有JD？先用示例体验' : '使用示例截图（模拟）'
          }
          disabled={busy}
          onClick={useExample}
        />
      </View>
      <View className="action-gap">
        <ActionButton
          label={mode === 'text' ? '确认文字并分析' : '核对岗位文字'}
          loading={busy}
          disabled={
            busy ||
            (mode === 'text'
              ? !validJd(text.text) || characterCount(text.title) > 100
              : !image.uploadId)
          }
          onClick={mode === 'text' ? submit : review}
        />
      </View>
      {typeof active === 'string' && active.length > 0 && (
        <View className="action-gap">
          <ActionButton
            label="恢复最近一次分析"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void Taro.navigateTo({
                url: `/pages/analysis/index?analysisJobId=${encodeURIComponent(active)}`,
              })
            }
          />
        </View>
      )}
    </View>
  );
}
