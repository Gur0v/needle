export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  position: number;
  playing: boolean;
  ended?: boolean;
  seeking?: boolean;
}

export interface Play {
  track: Track;
  startedAt: number;
  listened: number;
  lastAt: number;
  submitted: boolean;
}

export function validTrack(value: unknown): value is Track {
  if (!value || typeof value !== 'object') return false;
  const t = value as Track;
  return typeof t.id === 'string' && t.id.length > 0 && t.id.length < 1000 &&
    typeof t.title === 'string' && t.title.length > 0 && t.title.length < 1000 &&
    typeof t.artist === 'string' && t.artist.length > 0 && t.artist.length < 1000 &&
    (t.album === undefined || typeof t.album === 'string' && t.album.length < 1000) &&
    Number.isFinite(t.duration) && t.duration > 0 && Number.isFinite(t.position) && t.position >= 0 && typeof t.playing === 'boolean' &&
    (t.ended === undefined || typeof t.ended === 'boolean') &&
    (t.seeking === undefined || typeof t.seeking === 'boolean');
}

export function advance(play: Play | undefined, track: Track, now: number): Play {
  const replay = play && play.track.id === track.id && play.track.ended === true && track.playing && track.position < 3;
  if (!play || play.track.id !== track.id || replay) {
    return { track, startedAt: Math.floor(now / 1000), listened: 0, lastAt: now, submitted: false };
  }
  const elapsed = Math.max(0, Math.min((now - play.lastAt) / 1000, 15));
  const progress = Math.max(0, track.position - play.track.position);
  const listened = play.listened + (play.track.playing && !play.track.seeking && !track.seeking ? Math.min(elapsed, progress) : 0);
  return { ...play, track, listened, lastAt: now };
}

export function eligible(play: Play) {
  return !play.submitted && play.track.duration > 30 && play.listened >= Math.min(play.track.duration / 2, 240);
}
