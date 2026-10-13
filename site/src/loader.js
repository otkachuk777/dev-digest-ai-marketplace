async function fetchOk(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

export const loadCatalog = async () => (await fetchOk('./catalog.json')).json();
export const loadMeta = async () => (await fetchOk('./meta.json')).json();
export const loadIndexText = async (channel) => (await fetchOk(`./search-${channel}.json`)).text();
export const loadText = async (path) => (await fetchOk(`./${path}`)).text();

export function getStoredChannel() {
  try {
    const v = localStorage.getItem('channel');
    return v === 'stable' || v === 'latest' ? v : null;
  } catch {
    return null;
  }
}

export function storeChannel(value) {
  try {
    localStorage.setItem('channel', value);
  } catch {
    /* blocked storage: the channel then lives in the URL only */
  }
}
