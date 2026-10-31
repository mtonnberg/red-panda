import { WebSocket } from 'ws';

export async function connect(endpoint, { timeout = 15000 } = {}) {
  const socket = new WebSocket(endpoint, { handshakeTimeout: timeout });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let id = 0;
  const pending = new Map();
  const events = [];
  socket.on('close', () => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('CDP connection closed')); }
    pending.clear();
  });
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (!message.id) { events.push(message); return; }
    const entry = pending.get(message.id);
    if (entry) { pending.delete(message.id); clearTimeout(entry.timer); message.error ? entry.reject(Object.assign(new Error(message.error.message), message.error)) : entry.resolve(message.result); }
  });
  return {
    socket, events,
    send: (method, params = {}, sessionId, options = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method} (request ${requestId})`)); }, options.timeout ?? timeout);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
    }),
    close: async () => {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('CDP client closed')); }
      pending.clear();
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = new Promise(resolve => socket.once('close', resolve));
      const force = setTimeout(() => socket.terminate(), 1000); force.unref();
      socket.close();
      try { await closed; } finally { clearTimeout(force); }
    },
  };
}
