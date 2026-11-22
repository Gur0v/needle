import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const lastfm = vi.fn();
vi.mock('../src/lastfm', () => ({ lastfm, configured: () => true, authorizationUrl: () => '' }));

const track = { id: 'song', title: 'Song', artist: 'Artist', album: 'Album', duration: 200, position: 12, playing: true };
let listener: (message: unknown, sender: unknown) => any;
let storage: Record<string, any>;
let alarm: (alarm: { name: string }) => void;
const sender = { id: 'extension' };
const item = { artist: 'Artist', track: 'Song', timestamp: '1' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.resetModules();
  lastfm.mockReset();
  storage = { authToken: 'token' };
  vi.stubGlobal('browser', {
    storage: { local: {
      get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, storage[key]])),
      set: async (values: object) => { Object.assign(storage, values); },
      remove: async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
    } },
    runtime: { id: 'extension', onMessage: { addListener: (callback: typeof listener) => { listener = callback; } } },
    tabs: { onRemoved: { addListener: vi.fn() }, create: vi.fn() },
    alarms: { onAlarm: { addListener: (callback: typeof alarm) => { alarm = callback; } }, create: vi.fn() },
  });
  await import('../src/background');
});

afterEach(() => { vi.unstubAllGlobals(); });

async function receiveTrack() {
  listener({ type: 'playback', track }, { tab: { id: 1 }, url: 'https://music.youtube.com/watch?v=song' });
  await vi.waitFor(() => expect(storage.plays?.[1]?.track).toEqual(track));
}

test('sends the already-playing track after finishing connection', async () => {
  await receiveTrack();
  expect(lastfm).not.toHaveBeenCalled();
  lastfm.mockResolvedValueOnce({ session: { key: 'session-key', name: 'listener' } }).mockResolvedValue({});

  await listener({ type: 'finish-connect' }, { id: 'extension' });

  expect(lastfm).toHaveBeenCalledWith('auth.getSession', { token: 'token' });
  expect(lastfm).toHaveBeenCalledWith('track.updateNowPlaying', { sk: 'session-key', artist: 'Artist', track: 'Song', album: 'Album' });
});

test('status includes the current active track before connecting', async () => {
  await receiveTrack();
  const status = await listener({ type: 'status' }, { id: 'extension' });
  expect(status.track).toEqual(track);
});

test('does not report or announce a stale track', async () => {
  await receiveTrack();
  vi.spyOn(Date, 'now').mockReturnValue(storage.plays[1].lastAt + 15000);
  expect((await listener({ type: 'status' }, { id: 'extension' })).track).toBeUndefined();
  lastfm.mockResolvedValueOnce({ session: { key: 'session-key', name: 'listener' } }).mockResolvedValue({});
  await listener({ type: 'finish-connect' }, { id: 'extension' });
  expect(lastfm).not.toHaveBeenCalledWith('track.updateNowPlaying', expect.anything());
  vi.restoreAllMocks();
});

test("disconnect prevents in-flight authentication from restoring session", async () => {
  const pending = deferred<any>();
  lastfm.mockReturnValue(pending.promise);
  const connecting = listener({ type: "finish-connect" }, sender);
  await vi.waitFor(() => expect(lastfm).toHaveBeenCalled());
  await listener({ type: "disconnect" }, sender);
  pending.resolve({ session: { key: "old", name: "old" } });
  await connecting;
  expect(storage.session).toBeUndefined();
});

test("disconnect prevents an in-flight scrobble from changing new account queue", async () => {
  storage.session = { key: "old", name: "old" };
  storage.queue = [item];
  const pending = deferred<any>();
  lastfm.mockImplementation((method: string) => method === "track.scrobble" ? pending.promise : Promise.resolve({ session: { key: "new", name: "new" } }));
  alarm({ name: "retry" });
  await vi.waitFor(() => expect(lastfm).toHaveBeenCalledWith("track.scrobble", expect.objectContaining({ sk: "old" })));
  await listener({ type: "disconnect" }, sender);
  storage.authToken = "new-token";
  await listener({ type: "finish-connect" }, sender);
  storage.queue = [{ ...item, track: "new" }];
  pending.resolve({});
  await vi.waitFor(() => expect(lastfm).toHaveBeenCalledWith("track.scrobble", expect.objectContaining({ sk: "new", track: "new" })));
});

test("transient failures retain queue; permanent failures skip bad item", async () => {
  storage.session = { key: "key", name: "name" };
  storage.queue = [item, { ...item, track: "next" }];
  lastfm.mockRejectedValueOnce(new Error("offline"));
  alarm({ name: "retry" });
  await vi.waitFor(() => expect(storage.error).toContain("offline"));
  expect(storage.queue).toHaveLength(2);
  lastfm.mockRejectedValueOnce(Object.assign(new Error("ignored"), { permanent: true })).mockResolvedValue({});
  alarm({ name: "retry" });
  await vi.waitFor(() => expect(storage.queue).toEqual([]));
  expect(storage.error).toContain("ignored");
});

test('successful retry clears a transient error', async () => {
  storage.session = { key: 'key', name: 'name' };
  storage.queue = [item];
  lastfm.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
  alarm({ name: 'retry' });
  await vi.waitFor(() => expect(storage.error).toContain('offline'));
  alarm({ name: 'retry' });
  await vi.waitFor(() => expect(storage.queue).toEqual([]));
  expect(storage.error).toBeUndefined();
});

test("network calls do not block playback updates", async () => {
  storage.session = { key: "key", name: "name" };
  lastfm.mockReturnValue(new Promise(() => {}));
  await receiveTrack();
  listener({ type: "playback", track: { ...track, position: 20 } }, { tab: { id: 1 }, url: "https://music.youtube.com/watch" });
  await vi.waitFor(() => expect(storage.plays[1].track.position).toBe(20));
});

test("switching accounts preserves pending scrobbles", async () => {
  storage.session = { key: "old", name: "old" };
  storage.queue = [item];
  lastfm.mockResolvedValue({ session: { key: "new", name: "new" } });
  await expect(listener({ type: "finish-connect" }, sender)).rejects.toThrow("Disconnect before switching accounts");
  expect(storage.queue).toEqual([item]);
  expect(storage.session.key).toBe("old");
});

test('failed queue write retries eligible play without losing it', async () => {
  storage.session = { key: 'key', name: 'name' };
  const set = browser.storage.local.set as any;
  let failed = false;
  browser.storage.local.set = async (values: any) => {
    if (values.queue && !failed) { failed = true; throw new Error('disk full'); }
    return set(values);
  };
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  lastfm.mockReturnValue(new Promise(() => {}));
  await receiveTrack();
  for (let i = 1; i <= 10; i++) {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 15000);
    listener({ type: 'playback', track: { ...track, position: 12 + i * 15 } }, { tab: { id: 1 }, url: 'https://music.youtube.com/watch' });
    await vi.waitFor(() => expect(storage.plays[1].track.position).toBe(12 + i * 15));
  }
  await vi.waitFor(() => expect(failed).toBe(true));
  listener({ type: 'playback', track: { ...track, position: 170 } }, { tab: { id: 1 }, url: 'https://music.youtube.com/watch' });
  await vi.waitFor(() => expect(storage.queue).toHaveLength(1));
  log.mockRestore();
  vi.restoreAllMocks();
});

test('same-second transitions and paused tracks announce only active latest track', async () => {
  storage.session = { key: 'key', name: 'name' };
  const pending = deferred<any>();
  lastfm.mockReturnValueOnce(pending.promise).mockResolvedValue({});
  vi.spyOn(Date, 'now').mockReturnValue(100000);
  await receiveTrack();
  await vi.waitFor(() => expect(lastfm).toHaveBeenCalledTimes(1));
  const send = (value: any) => listener({ type: 'playback', track: value }, { tab: { id: 1 }, url: 'https://music.youtube.com/watch' });
  send({ ...track, id: 'second', title: 'Second', playing: false });
  await vi.waitFor(() => expect(storage.plays[1].track.id).toBe('second'));
  send({ ...track, id: 'third', title: 'Third' });
  await vi.waitFor(() => expect(storage.plays[1].track.id).toBe('third'));
  pending.resolve({});
  await vi.waitFor(() => expect(lastfm).toHaveBeenCalledTimes(2));
  expect(lastfm).toHaveBeenLastCalledWith('track.updateNowPlaying', expect.objectContaining({ track: 'Third' }));
  vi.restoreAllMocks();
});

test('connecting resets listening accumulated while disconnected', async () => {
  await receiveTrack();
  lastfm.mockResolvedValueOnce({ session: { key: 'key', name: 'name' } }).mockResolvedValue({});
  await listener({ type: 'finish-connect' }, sender);
  expect(storage.plays[1].listened).toBe(0);
  expect(storage.plays[1].submitted).toBe(false);
});

test('successful now playing preserves scrobble error', async () => {
  storage.session = { key: 'key', name: 'name' };
  storage.error = 'ignored scrobble';
  lastfm.mockResolvedValue({});
  await receiveTrack();
  await vi.waitFor(() => expect(lastfm).toHaveBeenCalledWith('track.updateNowPlaying', expect.anything()));
  expect(storage.error).toBe('ignored scrobble');
});
