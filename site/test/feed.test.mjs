import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildAtom } from '../build/feed.mjs';

const releases = [
  { plugin: 'demo-plugin', version: '1.1.0', tag: 'demo-plugin--v1.1.0', date: '2026-10-14T10:00:00+00:00', summary: 'Add <b>agent</b> & more.' },
  { plugin: 'demo-plugin', version: '1.0.0', tag: 'demo-plugin--v1.0.0', date: '2026-10-09T10:00:00+00:00', summary: 'First release.' },
];

test('buildAtom returns well-formed Atom with escaped text and absolute links', () => {
  const xml = buildAtom({ siteUrl: 'https://o.github.io/r/', repo: 'o/r', releases, updated: '2026-10-14T10:00:00+00:00' });
  const doc = new (new JSDOM('').window.DOMParser)().parseFromString(xml, 'application/xml');
  assert.equal(doc.querySelector('parsererror'), null);
  assert.equal(doc.documentElement.localName, 'feed');
  const entries = doc.getElementsByTagName('entry');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].getElementsByTagName('title')[0].textContent, 'demo-plugin 1.1.0');
  assert.equal(entries[0].getElementsByTagName('summary')[0].textContent, 'Add <b>agent</b> & more.');
  assert.equal(entries[0].getElementsByTagName('link')[0].getAttribute('href'), 'https://o.github.io/r/artifact.html?id=demo-plugin%2Fplugin%2Fdemo-plugin');
});

test('buildAtom works with no releases', () => {
  const xml = buildAtom({ siteUrl: 'https://o.github.io/r/', repo: 'o/r', releases: [], updated: '2026-10-14T10:00:00+00:00' });
  const doc = new (new JSDOM('').window.DOMParser)().parseFromString(xml, 'application/xml');
  assert.equal(doc.querySelector('parsererror'), null);
  assert.equal(doc.getElementsByTagName('entry').length, 0);
});
