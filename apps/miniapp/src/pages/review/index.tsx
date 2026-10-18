import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import { characterCount, validJd } from '../../../../../packages/domain/src';
import ActionButton from '../../components/ActionButton';
import FormField from '../../components/FormField';
import { guestApi } from '../../services/api';
import { imagePreview } from '../../services/images';
import {
  failureText,
  type JdDraft,
  readDraft,
  readReviewDraft,
  saveReviewDraft,
  submitConfirmed,
} from '../../services/jd-drafts';

export default function Review() {
  const ocrId = Taro.useRouter().params.ocrJobId ?? '';
  const [draft, setDraft] = useState<JdDraft>(() => {
    const saved = readReviewDraft(ocrId) ?? readDraft('image');
    return saved.ocrId === ocrId
      ? saved
      : { title: '', text: '', source: 'image-manual', ocrId };
  });
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  Taro.useDidHide(() => {
    alive.current = false;
  });
  Taro.useDidShow(() => {
    alive.current = true;
    if (!lock.current) setBusy(false);
  });
  useEffect(() => {
    let current = true;
    let dispose: (() => void) | undefined;
    setLoading(true);
    setReady(false);
    setError('');
    setPreview('');
    void (async () => {
      const ocr = await guestApi('getOcrJob', { path: { ocrJobId: ocrId } });
      const picture = await imagePreview(ocr.uploadId);
      if (!current) {
        picture.dispose();
        return;
      }
      dispose = picture.dispose;
      setPreview(picture.url);
      const saved = readReviewDraft(ocrId) ?? readDraft('image');
      const next =
        saved.ocrId === ocrId
          ? { ...saved, uploadId: ocr.uploadId }
          : {
              title: '',
              text: ocr.text ?? '',
              source:
                ocr.provider === 'local-fixture'
                  ? ('fixture-confirmed' as const)
                  : ('image-manual' as const),
              uploadId: ocr.uploadId,
              ocrId,
            };
      setDraft(next);
      setReady(true);
    })()
      .catch((failure) => {
        if (current) setError(failureText(failure));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      dispose?.();
    };
  }, [ocrId, reload]);
  const update = (next: JdDraft) => {
    setDraft(next);
    try {
      saveReviewDraft(ocrId, next);
    } catch {
      setError('本机草稿保存失败，请保留当前页面');
    }
  };
  const submit = async () => {
    if (lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (
        !validJd(draft.text) ||
        characterCount(draft.title) > 100 ||
        !draft.uploadId
      )
        throw new Error(
          '请核对有效文字与图片，JD最多8000字，岗位名称最多100字',
        );
      const result = await submitConfirmed({
        title: draft.title,
        text: draft.text,
        source: draft.source,
        uploadId: draft.uploadId,
      });
      if (result.current && alive.current)
        await Taro.navigateTo({
          url: `/pages/analysis/index?analysisJobId=${result.analysis.id}`,
        });
    } catch (failure) {
      if (alive.current) setError(failureText(failure));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <View className="page">
      <Text className="eyebrow">确认后再分析</Text>
      <Text className="title">识别后，先核对</Text>
      <Text className="description">
        {draft.source === 'fixture-confirmed'
          ? '当前是示例图片的本地模拟识别，不是真实OCR；请核对并编辑。'
          : '本地尚未接入真实OCR，请根据截图手工补录文字；不会套用示例岗位。'}
      </Text>
      {preview && (
        <Image className="jd-preview" src={preview} mode="widthFix" />
      )}
      {loading && (
        <Text className="description">正在恢复本人截图和核对稿…</Text>
      )}
      <FormField
        id="review-title"
        label="目标岗位（选填，最多100字）"
        value={draft.title}
        disabled={busy || loading}
        onChange={(title) => update({ ...draft, title })}
      />
      <FormField
        id="review-text"
        label="核对后的岗位文字"
        multiline
        value={draft.text}
        disabled={busy || loading}
        onChange={(text) => update({ ...draft, text })}
      />
      <Text className="catalog-count">
        {characterCount(draft.text)}/8000字 · 分析只使用这份确认稿
      </Text>
      {error && <Text className="error">{error}</Text>}
      {!ready && !loading && (
        <ActionButton
          label="重新读取截图"
          variant="secondary"
          onClick={() => setReload((value) => value + 1)}
        />
      )}
      <View className="action-gap">
        <ActionButton
          label="确认核对稿并分析"
          loading={busy}
          disabled={
            busy ||
            loading ||
            !ready ||
            !validJd(draft.text) ||
            characterCount(draft.title) > 100
          }
          onClick={() => void submit()}
        />
      </View>
      <View className="action-gap">
        <ActionButton
          label="返回修改截图"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
            else void Taro.redirectTo({ url: '/pages/jd/index?mode=image' });
          }}
        />
      </View>
    </View>
  );
}
