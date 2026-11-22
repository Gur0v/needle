import { describe, expect, it } from 'vitest';
import { advance, eligible, validTrack, type Track } from '../src/playback';
import { signature } from '../src/lastfm';

const track: Track = { id: 'a', title: 'Song', artist: 'Artist', duration: 60, position: 0, playing: true };

describe('playback', () => {
  it('counts playback, not pauses or seeks, and submits only once', () => {
    let play = advance(undefined, track, 0);
    for (let n = 1; n <= 6; n++) play = advance(play, { ...track, position: n * 5 }, n * 5000);
    expect(eligible(play)).toBe(true);
    play.submitted = true;
    expect(eligible(play)).toBe(false);
    play = advance(play, { ...track, position: 30, playing: false }, 31000);
    const listened = play.listened;
    play = advance(play, { ...track, position: 30, playing: false }, 41000);
    expect(play.listened).toBe(listened);
  });
  it('rejects malformed and short tracks', () => {
    expect(validTrack({ ...track, duration: NaN })).toBe(false);
    const play = { ...advance(undefined, { ...track, duration: 30 }, 0), listened: 30 };
    expect(eligible(play)).toBe(false);
  });
  it('preserves a play after seeking backward', () => {
    const play = { ...advance(undefined, { ...track, position: 50 }, 0), listened: 30, submitted: true };
    expect(advance(play, track, 5000)).toMatchObject({ startedAt: 0, listened: 30, submitted: true });
  });
  it('starts a new play after the track ends', () => {
    const play = advance(undefined, { ...track, position: 60, playing: false, ended: true }, 0);
    expect(advance(play, track, 5000)).toMatchObject({ startedAt: 5, listened: 0, submitted: false });
  });
  it('does not count a forward seek after a stall', () => {
    let play = advance(undefined, track, 0);
    play = advance(play, { ...track, position: 50, seeking: true }, 5000);
    expect(play.listened).toBe(0);
    play = advance(play, { ...track, position: 50 }, 5001);
    play = advance(play, { ...track, position: 55 }, 10001);
    expect(play.listened).toBe(5);
    expect(validTrack({ ...track, seeking: 'yes' })).toBe(false);
  });
  it('does not count stationary playback', () => {
    let play = advance(undefined, track, 0);
    for (let n = 1; n <= 40; n++) play = advance(play, track, n * 5000);
    expect(play.listened).toBe(0);
    expect(eligible(play)).toBe(false);
  });
});

it('signs sorted Last.fm parameters without format or callback', () => {
  expect(signature({ b: '2', format: 'json', a: '1' }, 'secret')).toBe('670699129dd49818b5abd9e7c2fd6569');
  expect(signature({ a: '1', b: '2', callback: 'x' }, 'secret')).toBe('670699129dd49818b5abd9e7c2fd6569');
});
