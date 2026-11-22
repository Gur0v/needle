import { beforeEach, expect, test, vi } from 'vitest';

let message: (event: unknown) => void;
let snapshots: unknown[];
let search: string;
let playerLink: string | undefined;
let video: { duration: number; currentTime: number; paused: boolean; ended: boolean; seeking?: boolean };
let events: Record<string, () => void>;
let playerTitle: string | undefined;
let playerArtist: string | undefined;

beforeEach(async () => {
  vi.resetModules();
  snapshots = [];
  search = '?v=old';
  playerLink = undefined;
  playerTitle = undefined;
  playerArtist = undefined;
  video = { duration: 200, currentTime: 12, paused: false, ended: false };
  events = {};
  vi.stubGlobal('location', { get search() { return search; }, get pathname() { return search ? '/watch' : '/'; }, href: 'https://music.youtube.com/watch?v=old', origin: 'https://music.youtube.com' });
  vi.stubGlobal('window', {
    addEventListener: (name: string, callback: typeof message) => { if (name === 'message') message = callback; },
    setInterval: vi.fn(), setTimeout: (callback: () => void) => { queueMicrotask(callback); return 1; },
  });
  vi.stubGlobal('document', {
    documentElement: {}, addEventListener: (name: string, callback: () => void) => { events[name] = callback; },
    querySelector: (selector: string) => selector === 'video' ? video : selector === 'ytmusic-player-bar, ytmusic-miniplayer' && playerTitle ? { querySelector: (s: string) => s === '.title' ? { textContent: playerTitle } : s === '.byline a, .subtitle a' ? { textContent: playerArtist } : null } : selector.startsWith('ytmusic-player-bar .yt-uix-sessionlink') && playerLink ? { href: playerLink } : null,
  });
  vi.stubGlobal('MutationObserver', class { observe() {} });
  vi.stubGlobal('browser', { runtime: { sendMessage: (value: unknown) => { snapshots.push(value); return Promise.resolve(); } } });
  await import('../src/content');
});

function deliver(data: unknown) {
  message({ source: window, origin: location.origin, data });
}

test('accepts validated metadata and preserves video timing', async () => {
  deliver({ source: 'needle-media-session', id: 'old', title: ' Song ', artist: ' Artist ', album: ' Album ' });
  await Promise.resolve();
  expect(snapshots.at(-1)).toEqual({ type: 'playback', track: { id: 'old', title: 'Song', artist: 'Artist', album: 'Album', duration: 200, position: 12, playing: true, ended: false } });
});

test('detects a track from the player link on the home page', async () => {
  search = '';
  playerLink = 'https://music.youtube.com/watch?v=home-song';
  deliver({ source: 'needle-media-session', id: 'home-song', title: 'Song', artist: 'Artist', album: '' });
  await Promise.resolve();
  expect((snapshots.at(-1) as { track: { id: string } }).track.id).toBe('home-song');
});

test('prefers the player identity over a browsed watch URL', async () => {
  playerLink = 'https://music.youtube.com/watch?v=playing';
  deliver({ source: 'needle-media-session', id: 'old', title: 'Wrong', artist: 'Artist', album: '' });
  expect(snapshots).toHaveLength(1);
  deliver({ source: 'needle-media-session', id: 'playing', title: 'Playing', artist: 'Artist', album: '' });
  await Promise.resolve();
  expect((snapshots.at(-1) as { track: { id: string } }).track.id).toBe('playing');
});

test('rejects null identity and off-site player links', async () => {
  search = '';
  playerLink = 'https://evil.example/watch?v=playing';
  deliver({ source: 'needle-media-session', id: null, title: 'Song', artist: 'Artist', album: '' });
  await Promise.resolve();
  expect(snapshots).toHaveLength(1);
});

test('sends ended state on the ended event', async () => {
  deliver({ source: 'needle-media-session', id: 'old', title: 'Song', artist: 'Artist', album: '' });
  await Promise.resolve();
  video.ended = true;
  events.ended();
  await Promise.resolve();
  expect((snapshots.at(-1) as { track: unknown }).track).toMatchObject({ playing: false, ended: true });
});

test('preserves rapid ended and play events', async () => {
  deliver({ source: 'needle-media-session', id: 'old', title: 'Song', artist: 'Artist', album: '' });
  await Promise.resolve();
  video.ended = true;
  events.ended();
  video.ended = false;
  video.currentTime = 0;
  events.play();
  expect(snapshots.slice(-2)).toMatchObject([
    { track: { ended: true, playing: false } },
    { track: { ended: false, playing: true, position: 0 } },
  ]);
});

test('flags both seek events and follows seeked with a normal snapshot', async () => {
  deliver({ source: 'needle-media-session', id: 'old', title: 'Song', artist: 'Artist', album: '' });
  await Promise.resolve();
  video.seeking = true;
  events.seeking();
  video.currentTime = 100;
  video.seeking = false;
  events.seeked();
  expect(snapshots.slice(-2)).toMatchObject([{ track: { seeking: true } }, { track: { seeking: true, position: 100 } }]);
  await Promise.resolve();
  expect((snapshots.at(-1) as { track: { seeking?: boolean } }).track.seeking).toBeUndefined();
});

test('rejects partially changed metadata during an identity transition', async () => {
  deliver({ source: 'needle-media-session', id: 'old', title: 'Old', artist: 'Artist', album: '' });
  await Promise.resolve();
  search = '?v=new';
  const count = snapshots.length;
  deliver({ source: 'needle-media-session', id: 'new', title: 'New', artist: 'Artist', album: '' });
  deliver({ source: 'needle-media-session', id: 'new', title: 'Old', artist: 'New artist', album: '' });
  expect(snapshots).toHaveLength(count);
});

test('accepts identical metadata on a new track when the player confirms it', async () => {
  deliver({ source: 'needle-media-session', id: 'old', title: 'Song', artist: 'Artist', album: 'First' });
  await Promise.resolve();
  search = '?v=new';
  playerTitle = 'Song';
  playerArtist = 'Artist';
  deliver({ source: 'needle-media-session', id: 'new', title: 'Song', artist: 'Artist', album: 'Second' });
  await Promise.resolve();
  expect((snapshots.at(-1) as { track: unknown }).track).toMatchObject({ id: 'new', album: 'Second' });
});

test('rejects invalid metadata and stale metadata during navigation', async () => {
  deliver({ source: 'needle-media-session', id: 'old', title: 'Old', artist: 'Artist', album: '' });
  await Promise.resolve();
  const count = snapshots.length;
  search = '?v=new';
  deliver({ source: 'needle-media-session', id: 'new', title: 'Old', artist: 'Artist', album: '' });
  expect(snapshots).toHaveLength(count);
  deliver({ source: 'needle-media-session', id: 'new', title: {}, artist: 'Artist', album: '' });
  expect(snapshots).toHaveLength(count);
  deliver({ source: 'needle-media-session', id: 'new', title: 'New', artist: 'New artist', album: '' });
  await Promise.resolve();
  expect((snapshots.at(-1) as { track: { id: string; title: string } }).track).toMatchObject({ id: 'new', title: 'New' });
});
