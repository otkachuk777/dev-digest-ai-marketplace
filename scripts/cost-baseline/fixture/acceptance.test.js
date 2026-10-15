// Hidden acceptance tests for SPEC-01. The agents never see this file: it is copied into the sandbox
// only after the implementation stage, so passing it proves the spec was met, not that the agents
// satisfied their own tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTodoList } from "../src/todo.js";

test("AC-1: clearCompleted removes every done item and returns the count", () => {
  const list = createTodoList();
  const a = list.add("a"); list.add("b"); const c = list.add("c");
  list.complete(a.id); list.complete(c.id);
  assert.equal(list.clearCompleted(), 2);
  assert.deepEqual(list.list().map((i) => i.title), ["b"]);
});

test("AC-2: with nothing done the list is unchanged and the result is 0", () => {
  const list = createTodoList();
  list.add("a"); list.add("b");
  const before = list.list();
  assert.equal(list.clearCompleted(), 0);
  assert.deepEqual(list.list(), before);
});

test("AC-3: remaining ids are unchanged and removed ids are never reused", () => {
  const list = createTodoList();
  const a = list.add("a"); const b = list.add("b");
  list.complete(a.id);
  list.clearCompleted();
  assert.deepEqual(list.list().map((i) => i.id), [b.id]);
  assert.equal(list.add("c").id, 3);
});

test("EC-1: clearCompleted on an empty list returns 0", () => {
  assert.equal(createTodoList().clearCompleted(), 0);
});

test("NFR-1: clearCompleted on 10000 items finishes within 200 ms", () => {
  const list = createTodoList();
  for (let i = 0; i < 10000; i++) { const { id } = list.add(`t${i}`); if (i % 2) list.complete(id); }
  const t0 = performance.now();
  assert.equal(list.clearCompleted(), 5000);
  assert.ok(performance.now() - t0 < 200);
});
