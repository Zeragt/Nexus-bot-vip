/**
 * الدخول: داخل Discord نستعمل Embedded App SDK (authorize ثم authenticate)،
 * وخارجه (للتجربة في المتصفح) نستعمل وضع الضيف إن كان مفعلاً على الخادم.
 */
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { api, setSession } from './api.js';

export const inDiscord = new URLSearchParams(location.search).has('frame_id');
export let sdk = null;

export async function login() {
  const cfg = await api('/config');
  if (inDiscord) {
    sdk = new DiscordSDK(cfg.clientId);
    await sdk.ready();
    const { code } = await sdk.commands.authorize({
      client_id: cfg.clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify'],
    });
    const r = await api('/token', { code });
    await sdk.commands.authenticate({ access_token: r.access_token });
    setSession(r.session);
    return { user: r.user, room: sdk.instanceId || sdk.channelId || 'discord' };
  }
  if (!cfg.allowGuest) throw new Error('افتح اللعبة من داخل Discord (قائمة الأنشطة في القناة).');
  let guest;
  try {
    guest = JSON.parse(localStorage.getItem('nexus-guest') || 'null');
  } catch {
    guest = null;
  }
  if (!guest) {
    guest = { id: Math.random().toString(36).slice(2, 10), name: `ضيف ${Math.floor(Math.random() * 900 + 100)}` };
    try {
      localStorage.setItem('nexus-guest', JSON.stringify(guest));
    } catch {
      /* تخزين غير متاح */
    }
  }
  const r = await api('/guest', guest);
  setSession(r.session);
  return { user: r.user, room: new URLSearchParams(location.search).get('room') || 'dev' };
}
