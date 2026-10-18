import type { CourseVideoProps } from './types';

export default function CourseVideo(p: CourseVideoProps) {
  return (
    // biome-ignore lint/a11y/useMediaCaption: 当前自制测试片无音轨；正式课程字幕随内容接入，不生成虚假字幕。
    <video
      className="course-video"
      aria-label="课程视频"
      src={p.src}
      controls
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        video.currentTime = Math.min(
          p.startPosition,
          Number.isFinite(video.duration) ? video.duration : p.startPosition,
        );
        p.onReady({
          seek: (seconds) => {
            video.currentTime = seconds;
          },
          pause: () => video.pause(),
          play: () => {
            void video.play().catch(p.onError);
          },
        });
      }}
      onTimeUpdate={(e) => p.onTime(e.currentTarget.currentTime)}
      onPause={(e) => p.onPause(e.currentTarget.currentTime)}
      onPlay={p.onPlay}
      onEnded={(e) => p.onEnded(e.currentTarget.currentTime)}
      onError={p.onError}
    >
      当前环境无法播放此视频。
    </video>
  );
}
