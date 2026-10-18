export type VideoControls = {
  seek: (seconds: number) => void;
  pause: () => void;
  play: () => void;
};
export interface CourseVideoProps {
  src: string;
  startPosition: number;
  onReady: (controls: VideoControls) => void;
  onTime: (position: number) => void;
  onPause: (position: number) => void;
  onPlay: () => void;
  onEnded: (position: number) => void;
  onError: () => void;
}
