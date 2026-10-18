import { Video } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useRef } from 'react';
import type { CourseVideoProps } from './types';

export default function CourseVideo(p: CourseVideoProps) {
  const position = useRef(p.startPosition);
  return (
    <Video
      id="learning-video"
      className="course-video"
      src={p.src}
      controls
      initialTime={p.startPosition}
      autoplay={false}
      onLoadedMetaData={() => {
        const context = Taro.createVideoContext('learning-video');
        p.onReady({
          seek: (seconds) => {
            void context.seek(seconds);
          },
          pause: () => {
            void context.pause();
          },
          play: () => {
            void context.play();
          },
        });
      }}
      onTimeUpdate={(e) => {
        position.current = e.detail.currentTime;
        p.onTime(position.current);
      }}
      onPause={() => p.onPause(position.current)}
      onPlay={p.onPlay}
      onEnded={() => p.onEnded(position.current)}
      onError={p.onError}
    />
  );
}
