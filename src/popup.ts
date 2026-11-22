export {};
const status = document.querySelector<HTMLElement>('#status')!;
const detail = document.querySelector<HTMLElement>('#detail')!;
const error = document.querySelector<HTMLElement>('#error')!;
const connect = document.querySelector<HTMLButtonElement>('#connect')!;
const finish = document.querySelector<HTMLButtonElement>('#finish')!;
const disconnect = document.querySelector<HTMLButtonElement>('#disconnect')!;

async function refresh() {
  const result = await browser.runtime.sendMessage({ type: 'status' });
  status.textContent = !result.configured ? 'Setup required' : result.username ? `Connected as ${result.username}` : 'Not connected';
  detail.textContent = !result.configured ? 'Needle needs Last.fm application credentials before it can connect.' : result.username ? `${result.track ? `${result.track.artist} — ${result.track.title}` : 'No active track detected'}${result.queued ? `\n${result.queued} ${result.queued === 1 ? 'scrobble' : 'scrobbles'} waiting to send` : ''}` : 'Connect your account to start scrobbling.';
  error.textContent = result.error || '';
  connect.hidden = !result.configured || !!result.username;
  finish.hidden = !result.configured || !!result.username;
  disconnect.hidden = !result.username;
}

async function action(type: string) {
  error.textContent = '';
  try {
    if (type === 'disconnect' && !window.confirm('Disconnect and discard any queued scrobbles?')) return;
    await browser.runtime.sendMessage({ type });
    await refresh();
    if (type === 'connect') detail.textContent = 'Approve Needle on Last.fm, then return and confirm below.';
  } catch (cause) { error.textContent = cause instanceof Error ? cause.message : String(cause); }
}
connect.addEventListener('click', () => void action('connect'));
finish.addEventListener('click', () => void action('finish-connect'));
disconnect.addEventListener('click', () => void action('disconnect'));
void refresh();
