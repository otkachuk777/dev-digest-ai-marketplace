import test from 'node:test';
import assert from 'node:assert/strict';
import { cardHtml, tileHtml, newsHtml } from '../src/ui.js';

const item = { id: 'p/skill/x', type: 'skill', name: 'x', plugin: 'p', version: '1.1.0', description: 'Run a <img src=x onerror=alert(1)> review', tags: ['review', 'git'], tokens: { always: 42, onInvoke: 10 } };

test('cardHtml escapes artifact text and builds a detail link', () => {
  const html = cardHtml(item, { terms: ['review'], channel: 'latest' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<mark>review<\/mark>/);
  assert.match(html, /href="artifact\.html\?id=p%2Fskill%2Fx"/);
  assert.match(html, /≈42 tokens always/);
  assert.match(html, /data-copy="p"/);
});

test('cardHtml keeps the stable channel in the link', () => {
  assert.match(cardHtml(item, { terms: [], channel: 'stable' }), /artifact\.html\?id=p%2Fskill%2Fx&amp;channel=stable/);
});

test('tiles', () => {
  assert.match(tileHtml('empty', {}), /No plugins published yet/);
  assert.match(tileHtml('no-results', { query: 'pdf <b>', requestUrl: 'https://x/y' }), /Nothing matches &quot;pdf &lt;b&gt;&quot;/);
  assert.match(tileHtml('error', { message: 'HTTP 500' }), /role="alert"[\s\S]*HTTP 500[\s\S]*data-action="retry"/);
  assert.match(tileHtml('not-found', { id: 'p/skill/old' }), /No artifact with id[\s\S]*p\/skill\/old/);
  assert.match(tileHtml('not-in-stable', { switchUrl: 'artifact.html?id=a' }), /Not available in stable/);
});

test('newsHtml lists releases or says there are none', () => {
  assert.match(newsHtml([], ''), /No releases yet/);
  const html = newsHtml([{ plugin: 'p', version: '1.0.0', tag: 't', date: '2026-10-14T10:00:00+00:00', summary: 'S <b>' }], '');
  assert.match(html, /2026-10-14/);
  assert.match(html, /p 1\.0\.0/);
  assert.match(html, /S &lt;b&gt;/);
});
