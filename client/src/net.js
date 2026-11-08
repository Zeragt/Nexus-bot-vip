/** اتصال WebSocket مع إعادة الاتصال التلقائية. */
import { getSession } from './api.js';

export function connect(room, onMessage, onStatus) {
  let ws;
  let closed = false;
  let retry = 0;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(getSession())}&room=${encodeURIComponent(room)}`);
    ws.onopen = () => {
      retry = 0;
      onStatus?.(true);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type !== 'ping') onMessage(msg);
      } catch {
        /* تجاهل */
      }
    };
    ws.onclose = () => {
      onStatus?.(false);
      if (!closed) setTimeout(open, Math.min(10000, 1000 * 2 ** retry++));
    };
  };
  open();
  return {
    send: (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg)),
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
