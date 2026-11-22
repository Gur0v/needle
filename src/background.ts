import { advance, eligible, validTrack, type Play, type Track } from './playback';
import { authorizationUrl, configured, lastfm } from './lastfm';

type Scrobble = { artist: string; track: string; timestamp: string; album?: string };
let chain = Promise.resolve();
let generation = 0;
let flushing = false;
let flushRequested = false;
let nowPlayingChain = Promise.resolve();
let nowPlayingVersion = 0;
const plays = new Map<number, Play>();
const restored = browser.storage.local.get('plays').then(({ plays: saved }) => {
  for (const [id, play] of Object.entries(saved || {})) plays.set(Number(id), play as Play);
});
async function savePlays() { await browser.storage.local.set({ plays: Object.fromEntries(plays) }); }
function isActive(play: Play) { return play.track.playing && Date.now() - play.lastAt < 15000; }
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = chain.then(work);
  chain = result.then(() => {}, () => {});
  return result;
}

async function flush() {
  if (flushing) { flushRequested = true; return; }
  flushing = true;
  flushRequested = false;
  try {
    while (true) {
      const snapshot = await serialize(async () => {
        const { session, queue = [] } = await browser.storage.local.get(['session', 'queue']);
        return session && queue.length ? { session, item: queue[0] as Scrobble, generation } : null;
      });
      if (!snapshot) return;
      let error: unknown;
      try { await lastfm('track.scrobble', { ...snapshot.item, sk: snapshot.session.key }); }
      catch (caught) { error = caught; }
      const proceed = await serialize(async () => {
        if (snapshot.generation !== generation) return false;
        const { session, queue = [] } = await browser.storage.local.get(['session', 'queue']);
        if (!session || session.key !== snapshot.session.key || !queue.length) return false;
        if (error) await browser.storage.local.set({ error: String(error), errorTransient: !(error as { permanent?: boolean }).permanent });
        if (error && !(error as { permanent?: boolean }).permanent) return false;
        const { errorTransient } = await browser.storage.local.get('errorTransient');
        await browser.storage.local.set({ queue: queue.slice(1), ...(!error && errorTransient && { error: undefined, errorTransient: false }) });
        return true;
      });
      if (!proceed) {
        if (snapshot.generation !== generation) continue;
        return;
      }
    }
  } finally {
    flushing = false;
    if (flushRequested) void flush().catch(console.error);
  }
}

function nowPlaying(sessionKey: string, track: Track, version: number) {
  const request = ++nowPlayingVersion;
  const work = nowPlayingChain.then(async () => {
    if (version !== generation || request !== nowPlayingVersion) return;
    let error: unknown;
    try {
      await lastfm('track.updateNowPlaying', { sk: sessionKey, artist: track.artist, track: track.title, ...(track.album ? { album: track.album } : {}) });
    } catch (caught) { error = caught; }
    await serialize(async () => {
      if (version !== generation || request !== nowPlayingVersion) return;
      if (error) await browser.storage.local.set({ error: String(error), errorTransient: true });
    });
  });
  nowPlayingChain = work.catch(console.error);
  return work;
}

async function playback(tabId: number, track: Track | null, receivedAt: number) {
  await restored;
  if (track === null) {
    const current = plays.get(tabId);
    if (current) { plays.set(tabId, { ...current, track: { ...current.track, playing: false } }); await savePlays(); }
    ++nowPlayingVersion;
    return;
  }
  const old = plays.get(tabId);
  const play = advance(old, track, receivedAt);
  plays.set(tabId, play);
  await savePlays();
  const { session } = await browser.storage.local.get('session');
  if (!session) return;
  const newPlay = !old || old.track.id !== track.id || (old.track.ended && track.playing && track.position < 3);
  if (!track.playing) ++nowPlayingVersion;
  else if (newPlay || !old.track.playing) void nowPlaying(session.key, track, generation).catch(console.error);
  if (eligible(play)) {
    const { queue = [] } = await browser.storage.local.get('queue');
    const item: Scrobble = { artist: track.artist, track: track.title, timestamp: String(play.startedAt), ...(track.album ? { album: track.album } : {}) };
    const submitted = { ...play, submitted: true };
    await browser.storage.local.set({ queue: [...queue, item], plays: { ...Object.fromEntries(plays), [tabId]: submitted } });
    plays.set(tabId, submitted);
    void flush().catch(console.error);
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'playback') {
    if (!sender.tab?.id || !sender.url?.startsWith('https://music.youtube.com/') || (message.track !== null && !validTrack(message.track))) return;
    const id = sender.tab.id;
    const receivedAt = Date.now();
    void serialize(() => playback(id, message.track, receivedAt)).catch(console.error);
    return;
  }
  if (sender.id !== browser.runtime.id || sender.tab) return;
  if (message?.type === 'status') return Promise.all([browser.storage.local.get(['session', 'queue', 'error']), restored]).then(([data]) => ({ configured: configured(), username: data.session?.name, queued: data.queue?.length || 0, error: data.error, track: [...plays.values()].find(play => isActive(play))?.track }));
  if (message?.type === 'connect') return (async () => {
    const version = ++generation;
    const { token } = await lastfm('auth.getToken');
    await serialize(async () => {
      if (version !== generation) return;
      await browser.storage.local.set({ authToken: token });
      await browser.tabs.create({ url: authorizationUrl(token) });
    });
  })();
  if (message?.type === 'finish-connect') return (async () => {
    const version = generation;
    const { authToken } = await browser.storage.local.get('authToken');
    if (!authToken) throw new Error('Start connecting first.');
    const { session } = await lastfm('auth.getSession', { token: authToken });
    const active = await serialize(async () => {
      if (version !== generation) return null;
      const current = await browser.storage.local.get('authToken');
      if (current.authToken !== authToken) return null;
      const previous = await browser.storage.local.get('session');
      if (previous.session && previous.session.name !== session.name) {
        const { queue = [] } = await browser.storage.local.get('queue');
        if (queue.length) throw new Error('Disconnect before switching accounts; queued scrobbles would be discarded.');
      }
      generation++;
      if (!previous.session || previous.session.name !== session.name) {
        await restored;
        for (const [id, play] of plays) plays.set(id, { ...play, listened: 0, submitted: false });
        await savePlays();
      }
      await browser.storage.local.set({ session });
      await browser.storage.local.remove(['authToken', 'error', 'errorTransient']);
      await restored;
      return { version: generation, tracks: [...plays.values()].filter(isActive).map(play => play.track) };
    });
    if (!active) return;
    await Promise.all(active.tracks.map(track => nowPlaying(session.key, track, active.version)));
    await flush();
  })();
  if (message?.type === 'disconnect') {
    generation++;
    return serialize(async () => {
      await restored;
      for (const [id, play] of plays) plays.set(id, { ...play, listened: 0, submitted: false });
      await savePlays();
      await browser.storage.local.remove(['session', 'authToken', 'queue', 'error', 'errorTransient']);
    });
  }
});

browser.tabs.onRemoved.addListener(id => {
  void serialize(async () => { await restored; plays.delete(id); await savePlays(); }).catch(console.error);
});
browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'retry') void flush().catch(console.error); });
void browser.alarms.create('retry', { periodInMinutes: 5 });
