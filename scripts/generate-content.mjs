import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

// Read only the original data prefix. No prototype DOM, routing, timers or state are executed.
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const prefix = source.slice(0, source.indexOf('const byId='));
const context = vm.createContext({});
vm.runInContext(`${prefix}\nglobalThis.content=scenes;`, context, {
  timeout: 1000,
});
const data = context.content.map((scene) => ({
  id: scene.id,
  name: scene.name,
  category: scene.cat,
  icon: scene.icon,
  description: scene.desc,
  output: scene.output,
  tasks: scene.tasks.map((name, index) => ({
    id: `${scene.id}-${index + 1}`,
    name,
  })),
  syllabus: Object.fromEntries(
    ['beginner', 'intermediate', 'advanced'].map((level, index) => [
      level,
      scene.levels[index],
    ]),
  ),
  questions: [
    {
      id: `${scene.id}-q1`,
      title: `开始“${scene.name}”任务前，最应该先明确什么？`,
      options: [
        '任务目标、已有材料和交付要求',
        '工具能生成的最多字数',
        '让 AI 自行猜测所有需求',
      ],
      correct: 0,
      explanation: '先说明目标、材料与验收要求，才能判断结果是否有用。',
    },
    ...scene.quiz.map((q, index) => ({
      id: `${scene.id}-q${index + 2}`,
      title: q[0],
      options: q[1],
      correct: q[2],
      explanation: `推荐答案：${q[1][q[2]]}。这是完成该场景任务时需要掌握的判断。`,
    })),
    {
      id: `${scene.id}-q4`,
      title: 'AI 给出了看起来很完整的结果，你会如何确认它可用？',
      options: [
        '语言通顺就直接提交',
        '按任务标准核对事实、材料和关键步骤',
        '只检查排版是否整齐',
      ],
      correct: 1,
      explanation: '表达流畅不代表结果正确，需要依据任务标准和真实材料核验。',
    },
  ],
}));
const directory = new URL('../packages/domain/fixtures/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(
  new URL('prototype-content.json', directory),
  `${JSON.stringify(data, null, 2)}\n`,
);
console.log(
  `Extracted ${data.length} scenes, ${data.reduce((sum, s) => sum + s.tasks.length, 0)} tasks, immutable fixture mock-question-set-v1.`,
);
