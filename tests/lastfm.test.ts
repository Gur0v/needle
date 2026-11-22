import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

test('classifies ignored scrobbles and Last.fm failures', async () => {
  vi.stubEnv('VITE_LASTFM_API_KEY', 'key');
  vi.stubEnv('VITE_LASTFM_API_SECRET', 'secret');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { lastfm } = await import('../src/lastfm');
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ scrobbles: { scrobble: { ignoredMessage: { code: '1', '#text': 'ignored' } } } }) });
  await expect(lastfm('track.scrobble')).rejects.toMatchObject({ permanent: true, message: expect.stringContaining('ignored') });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ error: 6, message: 'not found' }) });
  await expect(lastfm('track.scrobble')).rejects.toMatchObject({ permanent: true });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ error: 11, message: 'offline' }) });
  await expect(lastfm('track.scrobble')).rejects.toMatchObject({ permanent: false });
  fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 6, message: 'not found' }) });
  await expect(lastfm('track.scrobble')).rejects.toMatchObject({ permanent: true });
  fetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => { throw new Error('invalid'); } });
  await expect(lastfm('track.scrobble')).rejects.toThrow('Last.fm HTTP 429');
});
