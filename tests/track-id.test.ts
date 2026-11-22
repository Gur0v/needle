import { beforeEach, expect, test, vi } from 'vitest';
import { trackId } from '../src/track-id';

let player: string[], global: string[], pathname: string, search: string;

beforeEach(() => {
  player = [];
  global = [];
  pathname = '/';
  search = '';
  vi.stubGlobal('location', { get pathname() { return pathname; }, get search() { return search; }, href: 'https://music.youtube.com/' , origin: 'https://music.youtube.com' });
  vi.stubGlobal('document', { querySelectorAll: (selector: string) => (selector.startsWith('ytmusic-player-bar') ? player : global).map(href => ({ href })) });
});

test('uses the unique valid global video on the homepage', () => {
  global = ['/browse/channel', 'https://evil.example/watch?v=bad', '/watch?v=song', '/watch?v=song'];
  expect(trackId()).toBe('song');
  global.push('/watch?v=other');
  expect(trackId()).toBeNull();
});

test('prefers player candidates and falls back to watch URL before global links', () => {
  player = ['/browse/channel', '/watch?v=playing'];
  global = ['/watch?v=other'];
  pathname = '/watch'; search = '?v=browsed';
  expect(trackId()).toBe('playing');
  const query = vi.spyOn(document, 'querySelectorAll');
  trackId();
  expect(query.mock.calls[0][0]).toContain('ytmusic-player-bar a.title[href]');
  player = ['https://evil.example/watch?v=bad'];
  expect(trackId()).toBe('browsed');
});

test('rejects non-video paths and unsafe URL schemes', () => {
  global = ['https://music.youtube.com/browse/channel?v=bad', 'ftp://youtube.com/watch?v=bad', 'https://youtu.be/a/b'];
  expect(trackId()).toBeNull();
  global.push('https://youtu.be/song');
  expect(trackId()).toBe('song');
});

test('bridge reports the same homepage identity', async () => {
  vi.resetModules();
  global = ['/browse/channel', '/watch?v=song'];
  const postMessage = vi.fn();
  vi.stubGlobal('window', { postMessage, setInterval: vi.fn() });
  vi.stubGlobal('navigator', { mediaSession: { metadata: { title: 'Song', artist: 'Artist', album: '' } } });
  await import('../src/page-bridge');
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'song' }), 'https://music.youtube.com');
});
