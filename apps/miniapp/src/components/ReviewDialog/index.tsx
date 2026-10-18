import { Text, View } from '@tarojs/components';
import ActionButton from '../ActionButton';
import type { ReviewDialogProps } from './types';

export default function ReviewDialog(p: ReviewDialogProps) {
  return (
    <View className="review-backdrop" onClick={p.onClose}>
      <View className="review-sheet" onClick={(e) => e.stopPropagation()}>
        <Text className="row-title">答题回顾</Text>
        <ActionButton label="关闭答题回顾" variant="link" onClick={p.onClose} />
        {p.children}
      </View>
    </View>
  );
}
