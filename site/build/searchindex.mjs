import MiniSearch from 'minisearch';
import { searchOptions } from '../src/search-options.js';

export function buildSearchIndex(docs) {
  const ms = new MiniSearch(searchOptions);
  ms.addAll(docs);
  return JSON.stringify(ms);
}
