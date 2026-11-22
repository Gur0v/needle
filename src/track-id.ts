export function trackId(): string | null {
  const link = document.querySelector<HTMLAnchorElement>('ytmusic-player-bar .yt-uix-sessionlink[href], ytmusic-miniplayer .yt-uix-sessionlink[href], ytmusic-player-bar .title a[href], ytmusic-miniplayer .title a[href]');
  if (!link) return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
  try {
    const url = new URL(link.href, location.href);
    if (!['music.youtube.com', 'www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) return null;
    return url.hostname === 'youtu.be' ? url.pathname.slice(1).split('/')[0] || null : url.searchParams.get('v');
  } catch { return null; }
}
