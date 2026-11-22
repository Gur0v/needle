export {};

function trackId(): string | null {
  const selectors = 'ytmusic-player-bar .yt-uix-sessionlink[href], ytmusic-miniplayer .yt-uix-sessionlink[href], ytmusic-player-bar .title a[href], ytmusic-miniplayer .title a[href], ytmusic-player-bar a.title[href], ytmusic-miniplayer a.title[href]';
  function ids(selector: string): string[] {
    return Array.from(document.querySelectorAll<HTMLAnchorElement>(selector), link => {
      try {
        const url = new URL(link.href, location.href);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean).length === 1 ? url.pathname.slice(1) : null;
        if (!['music.youtube.com', 'www.youtube.com', 'youtube.com'].includes(url.hostname) || url.pathname !== '/watch') return null;
        return url.searchParams.get('v');
      } catch { return null; }
    }).filter((id): id is string => Boolean(id));
  }
  const player = ids(selectors)[0];
  if (player) return player;
  if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v');
  // shortcut: a unique global link may not identify the player, upgrade when player identity is exposed reliably.
  const global = new Set(ids('.yt-uix-sessionlink[href]'));
  return global.size === 1 ? [...global][0] : null;
}

function sendMetadata(): void {
  const metadata = navigator.mediaSession?.metadata;
  window.postMessage({
    source: 'needle-media-session',
    id: trackId(),
    title: metadata?.title,
    artist: metadata?.artist,
    album: metadata?.album,
  }, location.origin);
}

window.setInterval(sendMetadata, 1000);
sendMetadata();
