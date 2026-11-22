import type { Track } from './playback';
import { trackId } from './track-id';

let media: { id: string; title: string; artist: string; album: string } | undefined;

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
  const data = event.data as Record<string, unknown>;
  if (data.source !== 'needle-media-session') return;
  const id = trackId();
  if (!id || data.id !== id ||
      typeof data.title !== 'string' || typeof data.artist !== 'string' || typeof data.album !== 'string' ||
      !data.title.trim() || !data.artist.trim() || [id, data.title, data.artist, data.album].some(value => value.length >= 1000)) {
    return;
  }
  const title = data.title.trim(), artist = data.artist.trim();
  if (media && media.id !== id && (media.title === title || media.artist === artist)) {
    const player = document.querySelector('ytmusic-player-bar, ytmusic-miniplayer');
    const playerTitle = player?.querySelector('.title')?.textContent?.trim();
    const playerArtist = player?.querySelector('.byline a, .subtitle a')?.textContent?.trim();
    if (!playerTitle || !playerArtist || playerTitle !== title || playerArtist !== artist) return;
  }
  media = { id, title, artist, album: data.album.trim() };
  scheduleSnapshot();
});

function sendSnapshot(seeking = false): void {
  const player = document.querySelector('ytmusic-player-bar, ytmusic-miniplayer');
  const video = document.querySelector<HTMLVideoElement>('video');
  const titleLink = player?.querySelector<HTMLAnchorElement>('.title a, a.title');
  const domTitle = (titleLink?.textContent || player?.querySelector('.title')?.textContent || '').trim();
  const byline = player?.querySelector('.byline, .subtitle');
  const domArtist = (byline?.querySelector('a[href*="/channel/"], a[href*="/browse/"]')?.textContent || '').trim();
  const domAlbum = (byline?.querySelector('a[href*="/playlist?list="], a[href*="/browse/MPRE"]')?.textContent || '').trim();
  const id = trackId();
  const currentMedia = media?.id === id ? media : undefined;
  const title = currentMedia ? currentMedia.title : domTitle;
  const artist = currentMedia ? currentMedia.artist : domArtist;
  const album = currentMedia ? currentMedia.album : domAlbum;
  const titleId = titleLink?.href ? new URL(titleLink.href, location.href).searchParams.get('v') : null;
  const isAd = Boolean(document.querySelector('ytmusic-miniplayer.advertisement, .ytmusic-player-bar.advertisement, .ad-showing'));

  const snapshot: Track | null = !isAd && video && id && (!titleId || titleId === id) && title && artist &&
    Number.isFinite(video.duration) && video.duration > 0 && Number.isFinite(video.currentTime) && video.currentTime >= 0
    ? { id, title, artist, ...(album ? { album } : {}), duration: video.duration, position: video.currentTime, playing: !video.paused && !video.ended, ended: video.ended, ...(seeking || video.seeking ? { seeking: true } : {}) }
    : null;

  void browser.runtime.sendMessage({ type: 'playback', track: snapshot }).catch(() => {});
}

let pending: number | undefined;
function scheduleSnapshot(): void {
  if (pending !== undefined) return;
  pending = window.setTimeout(() => {
    pending = undefined;
    sendSnapshot();
  }, 100);
}

for (const event of ['play', 'ended']) {
  document.addEventListener(event, () => sendSnapshot(), true);
}
for (const event of ['seeking', 'seeked']) {
  document.addEventListener(event, () => {
    sendSnapshot(true);
    if (event === 'seeked') scheduleSnapshot();
  }, true);
}
for (const event of ['playing', 'pause', 'durationchange', 'loadedmetadata', 'emptied']) {
  document.addEventListener(event, scheduleSnapshot, true);
}
window.addEventListener('yt-navigate-finish', scheduleSnapshot);
new MutationObserver(scheduleSnapshot).observe(document.documentElement, {
  subtree: true, childList: true, characterData: true, attributes: true,
  attributeFilter: ['class', 'href'],
});
window.setInterval(() => sendSnapshot(), 5000);
sendSnapshot();
