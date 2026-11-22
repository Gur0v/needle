# Needle

A lightweight Firefox extension that scrobbles YouTube Music to Last.fm.

## Install

Download the signed `.xpi` from the latest release and open it in Firefox 142 or later. Connect Last.fm from the Needle popup.

## Build

Requires [Bun](https://bun.sh/docs/installation) 1.4.5, [Node.js](https://nodejs.org/en/download) 24.22.1, and a [Last.fm API application](https://www.last.fm/api/account/create). Version 0.1.1 was built on Linux x86-64.

Add `VITE_LASTFM_API_KEY` and `VITE_LASTFM_API_SECRET` to `.env.local`, then run:

```sh
bun install --frozen-lockfile
bun run build
bun run dev
```

Credentials are embedded in the extension. An exact release rebuild requires the original application credentials.

## Privacy and limitations

Needle reads YouTube Music playback information, stores its Last.fm session and pending scrobbles locally, and sends track details and timestamps to Last.fm. Disconnecting removes the session and queue; playback records can remain until their tabs close.

YouTube Music changes may break track detection. Metadata can arrive out of sync with track identity, and retrying after a lost response may duplicate a scrobble.

## License

[Apache License 2.0](LICENSE).
