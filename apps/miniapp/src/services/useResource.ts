import Taro from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import { messageOf } from './learning';

// Refresh when returning to a cached Taro page; stale responses cannot replace a newer load.
export function useResource<T>(load: () => Promise<T>, identity: string) {
  const loader = useRef(load);
  loader.current = load;
  const sequence = useRef(0);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  Taro.useDidShow(() => setRetry((n) => n + 1));
  useEffect(() => {
    const id = ++sequence.current;
    setData(undefined);
    setError('');
    void loader
      .current()
      .then((value) => {
        if (id === sequence.current) setData(value);
      })
      .catch((e) => {
        if (id === sequence.current) setError(messageOf(e));
      });
    return () => {
      ++sequence.current;
    };
  }, [identity, retry]);
  return {
    data,
    setData,
    error,
    setError,
    reload: () => setRetry((n) => n + 1),
  };
}
