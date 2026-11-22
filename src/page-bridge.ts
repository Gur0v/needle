export {};

function trackId(): string | null {
  const link = document.querySelector<HTMLAnchorElement>('ytmusic-player-bar .yt-uix-sessionlink[href], ytmusic-miniplayer .yt-uix-sessionlink[href], ytmusic-player-bar .title a[href], ytmusic-miniplayer .title a[href]');
  if (!link) return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
  try {
    const url = new URL(link.href, location.href);
    if (!['music.youtube.com', 'www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1).split('/')[0] : url.searchParams.get('v');
    return id || (location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null);
  } catch { return null; }
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
