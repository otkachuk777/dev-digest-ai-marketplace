// Shared by the build (to create the index) and the browser (to load it). Keep them identical.
export const searchOptions = {
  idField: 'id',
  fields: ['name', 'tags', 'description', 'body'],
  storeFields: ['type'],
  searchOptions: {
    boost: { name: 5, tags: 3, description: 2, body: 1 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: 'OR',
  },
};
