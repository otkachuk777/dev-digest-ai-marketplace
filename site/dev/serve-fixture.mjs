import { resolve } from 'node:path';
import { build } from '../build/index.mjs';
import { createFixtureRepo, FIXTURE_REPO } from './make-fixture-repo.mjs';
import { serve } from './serve.mjs';

const { root } = createFixtureRepo();
const out = resolve('dist');
const r = build({ repoRoot: root, stableRef: 'stable', repo: FIXTURE_REPO, out });
console.log(`Fixture build: ${r.artifacts} artifacts, stable: ${r.stable}`);
await serve({ dir: out, port: 4173 });
