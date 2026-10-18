import { Text, View } from '@tarojs/components';
import ActionButton from '../ActionButton';

export default function LoadState({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <View className="card">
      {error ? (
        <>
          <Text className="error">{error}</Text>
          <ActionButton label="重新加载" onClick={retry} />
        </>
      ) : (
        <Text className="description">正在加载…</Text>
      )}
    </View>
  );
}
