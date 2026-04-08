import * as assert from 'assert';
import { Pipeline } from '../core/pipeline';
import { SubTask } from '../core/state';

function makeTask(id: string, dependsOn: string[] = []): SubTask {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    files: [],
    dependsOn,
    status: 'pending',
  };
}

suite('Pipeline', () => {
  test('getReady returns tasks with no dependencies', () => {
    const pipeline = new Pipeline();
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    pipeline.load(tasks);

    const ready = pipeline.getReady(new Set());
    assert.strictEqual(ready.length, 3);
  });

  test('getReady respects dependencies', () => {
    const pipeline = new Pipeline();
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a']),
      makeTask('c', ['b']),
    ];
    pipeline.load(tasks);

    const ready1 = pipeline.getReady(new Set());
    assert.strictEqual(ready1.length, 1);
    assert.strictEqual(ready1[0].id, 'a');

    const ready2 = pipeline.getReady(new Set(['a']));
    assert.strictEqual(ready2.length, 1);
    assert.strictEqual(ready2[0].id, 'b');
  });

  test('hasCycle detects circular dependencies', () => {
    const pipeline = new Pipeline();
    const tasks = [
      makeTask('a', ['c']),
      makeTask('b', ['a']),
      makeTask('c', ['b']),
    ];
    pipeline.load(tasks);

    assert.strictEqual(pipeline.hasCycle(), true);
  });

  test('hasCycle returns false for DAG', () => {
    const pipeline = new Pipeline();
    const tasks = [
      makeTask('a'),
      makeTask('b', ['a']),
      makeTask('c', ['a']),
    ];
    pipeline.load(tasks);

    assert.strictEqual(pipeline.hasCycle(), false);
  });

  test('getReady filters already completed tasks', () => {
    const pipeline = new Pipeline();
    const tasks = [makeTask('a'), makeTask('b')];
    pipeline.load(tasks);

    const ready = pipeline.getReady(new Set(['a']));
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].id, 'b');
  });
});

suite('SubTask status', () => {
  test('default status is pending', () => {
    const task = makeTask('x');
    assert.strictEqual(task.status, 'pending');
  });
});
