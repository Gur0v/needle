import md5 from 'blueimp-md5';

const apiKey = import.meta.env.VITE_LASTFM_API_KEY || '';
const apiSecret = import.meta.env.VITE_LASTFM_API_SECRET || '';

export function configured() { return Boolean(apiKey && apiSecret); }

export function signature(params: Record<string, string>, secret: string) {
  return md5(Object.keys(params).filter(key => key !== 'format' && key !== 'callback').sort().map(key => key + params[key]).join('') + secret);
}

export async function lastfm(method: string, params: Record<string, string> = {}) {
  if (!configured()) throw new Error('Needle needs Last.fm application credentials at build time.');
  const fields = { method, api_key: apiKey, ...params };
  const body = new URLSearchParams({ ...fields, api_sig: signature(fields, apiSecret), format: 'json' });
  const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST', body, signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok && !data?.error) throw new Error(`Last.fm HTTP ${response.status}`);
  if (!data) throw new Error('Last.fm returned invalid JSON');
  if (data.error) throw Object.assign(new Error(`Last.fm: ${data.message || data.error}`), { permanent: [6, 7].includes(Number(data.error)) });
  const ignored = data.scrobbles?.scrobble?.ignoredMessage;
  if (method === 'track.scrobble' && Number(ignored?.code)) throw Object.assign(new Error(`Last.fm ignored scrobble: ${ignored['#text'] || ignored.code}`), { permanent: true });
  return data;
}

export function authorizationUrl(token: string) {
  return `https://www.last.fm/api/auth/?${new URLSearchParams({ api_key: apiKey, token })}`;
}
