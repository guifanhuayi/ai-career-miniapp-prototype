import assert from 'node:assert/strict';
import test from 'node:test';
import content from '../../packages/domain/fixtures/prototype-content.json';
import { levels } from '../../packages/domain/src';

test('M2-014 MT-051/059: frozen prototype fixture has17scenes/36tasks/51level groups', () => {
  assert.equal(content.length, 17);
  assert.equal(new Set(content.map((scene) => scene.id)).size, 17);
  assert.equal(content.flatMap((scene) => scene.tasks).length, 36);
  assert.equal(
    new Set(content.flatMap((scene) => scene.tasks.map((task) => task.id)))
      .size,
    36,
  );
  assert.equal(
    content.flatMap((scene) => levels.flatMap((level) => scene.syllabus[level]))
      .length,
    168,
  );
});
test('M2-015 MT-065: every mock set contains two common/two scene questions with valid answer indexes', () => {
  for (const scene of content) {
    assert.equal(scene.questions.length, 4);
    for (const question of scene.questions) {
      assert.equal(question.options.length, 3);
      assert.ok(
        question.correct >= 0 && question.correct < question.options.length,
      );
      assert.ok(question.explanation.length > 0);
    }
  }
});
