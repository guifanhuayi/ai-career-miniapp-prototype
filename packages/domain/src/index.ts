export const levels = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof levels)[number];
export const levelNames: Record<Level, string> = {
  beginner: '初阶',
  intermediate: '进阶',
  advanced: '高阶',
};
export const QUESTION_SET_VERSION = 'mock-question-set-v1';
export const SCORING_RULE_VERSION = 'mock-score-v1';
export const CONTENT_VERSION = 'prototype-content-v1';
export const MAX_COURSE_SECONDS = 2100;
export const MAX_JD_CHARACTERS = 8000;
// Unicode code points (Array.from), not UTF-16 code units or grapheme clusters.
export const characterCount = (value: string) => Array.from(value).length;
export function validJd(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    characterCount(value) <= MAX_JD_CHARACTERS
  );
}
export function eligibleDuration(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_COURSE_SECONDS
  );
}
export function scoreLevel(score: number): Level {
  if (!Number.isInteger(score) || score < 0 || score > 4)
    throw new RangeError('Score must be 0..4');
  return score <= 1 ? 'beginner' : score <= 3 ? 'intermediate' : 'advanced';
}
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '待核对';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export interface Scene {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  output: string;
  tasks: { id: string; name: string }[];
  syllabus: Record<Level, string[]>;
  questions: Question[];
}
export interface Question {
  id: string;
  title: string;
  options: string[];
  correct: number;
  explanation: string;
}
export interface Evidence {
  sceneId: string;
  kind: 'direct' | 'extension';
  quote: string;
  start: number;
  end: number;
}
const keywords: Record<string, RegExp> = {
  prompt: /提示词|文案|脚本|撰写|写作/gi,
  skill: /\bskill\b/gi,
  api: /\bapi\b|接口调用/gi,
  models: /模型选型|模型对比|模型排名/gi,
  plugins: /插件/gi,
  agent: /\bagent\b|智能体/gi,
  workflow: /工作流/gi,
  mcp: /\bmcp\b/gi,
  rag: /\brag\b|知识库/gi,
  ppt: /\bppt\b|幻灯片/gi,
  data: /\bexcel\b|数据分析|分析.{0,6}数据|表格/gi,
  resume: /简历/gi,
  interview: /面试/gi,
  research: /调研|检索|竞品|行业研究/gi,
  media: /图片生成|视频生成|生成.{0,4}视频|制作.{0,4}海报|生成.{0,4}图像/gi,
  coding: /编程|编写.{0,4}代码|代码开发/gi,
  prototype: /产品原型|小程序原型/gi,
};
export function analyzeJd(
  text: string,
  knownSceneIds: readonly string[],
): Evidence[] {
  if (!validJd(text)) throw new RangeError('Invalid JD');
  const result: Evidence[] = [];
  for (const id of knownSceneIds) {
    const pattern = keywords[id];
    if (!pattern) continue;
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const clauseStart =
        Math.max(
          text.lastIndexOf('。', start),
          text.lastIndexOf('，', start),
          text.lastIndexOf('\n', start),
          text.lastIndexOf('；', start),
          text.lastIndexOf(',', start),
        ) + 1;
      const prefix = text.slice(clauseStart, start);
      if (
        /(无需|不要求|不需要|不负责|不涉及|无须|不必)[^。；，\n]{0,24}$/.test(
          prefix,
        ) ||
        /(?:不|别|避免)\s*$/.test(prefix)
      )
        continue;
      result.push({
        sceneId: id,
        kind: 'direct',
        quote: match[0],
        start,
        end: start + match[0].length,
      });
      break;
    }
  }
  return result.length
    ? result
    : knownSceneIds.includes('prompt')
      ? [{ sceneId: 'prompt', kind: 'extension', quote: '', start: 0, end: 0 }]
      : [];
}
export function validateEvidence(
  text: string,
  items: Evidence[],
  known: readonly string[],
) {
  return items.every(
    (item) =>
      known.includes(item.sceneId) &&
      (item.kind === 'extension'
        ? item.quote === ''
        : Number.isInteger(item.start) &&
          item.start >= 0 &&
          item.end > item.start &&
          text.slice(item.start, item.end) === item.quote),
  );
}
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
