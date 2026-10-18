export const learningEvents = new Set([
  'task_selected',
  'assessment_started',
  'assessment_submitted',
  'course_open_attempted',
  'learning_plan_resumed',
  'course_mark_changed',
]);
export const serverEvents = new Set([
  'analysis_completed',
  'assessment_submitted',
  'assessment_started',
  'task_selected',
  'level_changed',
  'course_mark_changed',
]);
export const clientEvents = new Set([
  'page_view',
  'jd_submit',
  'ocr_result_confirmed',
  'scene_selected',
  'recommendation_viewed',
  'course_detail_viewed',
  'course_open_attempted',
  'video_started',
  'video_paused',
  'video_progress',
  'video_ended',
  'learning_plan_resumed',
]);
export function chinaDay(date: Date): string {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
