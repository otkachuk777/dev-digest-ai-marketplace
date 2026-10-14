import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

const schema = JSON.parse(readFileSync(new URL('./catalog.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

export function assertValidCatalog(catalog) {
  if (validate(catalog)) return;
  const lines = validate.errors.slice(0, 10).map((e) => `  ${e.instancePath || '/'} ${e.message}`);
  throw new Error(`catalog.json is invalid:\n${lines.join('\n')}`);
}
