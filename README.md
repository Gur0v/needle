# Needle

A lightweight Firefox extension that scrobbles YouTube Music to Last.fm.

## Requirements

- Firefox 142 or later
- [Bun](https://bun.sh/) 1.4.5 or later and Node.js 24 for development
- A Last.fm account and a [Last.fm API application](https://www.last.fm/api/account/create) for local builds

## Setup

Install dependencies:

```sh
bun install --frozen-lockfile
```

Create `.env.local` in the project root with your application's credentials:

```dotenv
VITE_LASTFM_API_KEY=your_api_key
VITE_LASTFM_API_SECRET=your_api_secret
```

Build and run in a dedicated Firefox development profile:

```sh
bun run build
bun run dev
```

Alternatively, open `about:debugging` in your existing Firefox profile, select **This Firefox**, choose **Load Temporary Add-on**, and open `dist/manifest.json`. Temporary add-ons must be loaded again after Firefox closes. Rebuild and reload the add-on after source changes.

In Needle, select **Connect to Last.fm**, approve access, then select **I've approved Needle** in the popup. The dedicated development profile in `.firefox-profile/` retains browser logins and contains private account data.

## Checks

```sh
bun run test
bun run build
bun run web-ext lint --source-dir dist
```

## Privacy and limitations

Needle reads playback metadata and position on YouTube Music. It stores the Last.fm session key, playback state, and pending scrobbles locally, and sends track metadata and timestamps to Last.fm. Disconnecting removes the session and pending queue; playback records can remain until their browser tabs close.

Last.fm application credentials are included in the built extension and are inspectable. Use dedicated credentials; never commit `.env` files or assume the application secret is private. Users of a distributed build do not need their own API application.

YouTube Music can change its player, and Needle may skip tracks without identifiable metadata or duration. Player metadata can arrive out of sync with track identity. Failed scrobbles are queued, but a lost response after a successful submission can cause a duplicate retry.

## License

[Apache License 2.0](LICENSE).
