import http from 'node:http';
import { Browser } from './browser.js';
import { createMCPHandler } from './mcp.js';

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const toolResult = (id, text, isError = false) => ({ jsonrpc: '2.0', id,
  result: { content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }], isError } });

function send(response, status, value, headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  const text = value === undefined ? '' : typeof value === 'string' ? value : `${JSON.stringify(value)}\n`;
  response.writeHead(status, { ...(value !== undefined && typeof value !== 'string' ? { 'content-type': 'application/json' } : {}),
    'content-length': Buffer.byteLength(text), ...headers });
  response.end(text);
}
function readBody(request, maximum) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0, failed = false;
    request.on('data', chunk => {
      if (failed) return;
      length += chunk.length;
      if (length > maximum) {
        failed = true; chunks.length = 0;
        reject(Object.assign(new Error('Request body too large'), { httpStatus: 413 }));
      } else chunks.push(chunk);
    });
    request.once('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    request.once('error', reject);
    request.once('aborted', () => reject(Object.assign(new Error('Request aborted'), { httpStatus: 400 })));
  });
}
function validSessionId(id) { return typeof id === 'string' && /^[\x21-\x7e]{1,256}$/.test(id); }

/** Native-compatible immediate-JSON MCP HTTP transport (GET/SSE is unsupported). */
export async function serveMCPHTTP({
  host = '127.0.0.1', port = 0, httpSessionTimeout = 0, maxBodyBytes = 4 * 1024 * 1024,
  remoteAllowOrigins = [], strictUnknownSessions = false, browser, browserOptions = {},
  ...handlerOptions
} = {}) {
  if (!Number.isInteger(httpSessionTimeout) || httpSessionTimeout < 0) throw new Error('httpSessionTimeout must be non-negative seconds');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) throw new Error('maxBodyBytes must be a positive integer');
  if (!Array.isArray(remoteAllowOrigins) || remoteAllowOrigins.some(origin => typeof origin !== 'string')) throw new Error('remoteAllowOrigins must be an array of strings');
  const ownsBrowser = !browser;
  browser ??= new Browser(browserOptions);
  const sessions = new Map(), expired = new Set();
  let sequence = 0, closing;
  const nextId = () => { let id; do { id = `s${++sequence}`; } while (sessions.has(id) || expired.has(id)); return id; };
  const create = id => {
    expired.delete(id);
    const session = { id, handler: createMCPHandler({ ...handlerOptions, browser }), lastActive: Date.now(), busy: 0, tail: Promise.resolve() };
    sessions.set(id, session); return session;
  };
  const dispose = (id, didExpire = false) => {
    if (id === 'default') return false;
    const session = sessions.get(id);
    if (!session) return false;
    sessions.delete(id); session.handler.close();
    if (didExpire) expired.add(id); else expired.delete(id);
    return true;
  };
  const expireIdle = () => {
    if (!httpSessionTimeout) return;
    const cutoff = Date.now() - httpSessionTimeout * 1000;
    for (const session of sessions.values()) if (session.id !== 'default' && !session.busy && session.lastActive <= cutoff) dispose(session.id, true);
  };
  create('default');
  const timer = httpSessionTimeout ? setInterval(expireIdle, Math.min(httpSessionTimeout * 1000, 1000)) : null;
  timer?.unref();

  async function dispatch(session, request) {
    if (request?.jsonrpc === '2.0' && request.id !== undefined && request.method === 'tools/call') {
      const { name, arguments: args = {} } = request.params ?? {};
      if (['session_new', 'session_list', 'session_close'].includes(name)) {
        if (!args || typeof args !== 'object' || Array.isArray(args)) return toolResult(request.id, 'arguments must be an object', true);
        if (name === 'session_new') {
          if (args.name !== undefined && !validSessionId(args.name)) return toolResult(request.id, 'name must be a visible ASCII session id', true);
          const id = args.name ?? nextId();
          if (!sessions.has(id)) create(id);
          return toolResult(request.id, `session ${id}`);
        }
        if (name === 'session_list') {
          expireIdle();
          return toolResult(request.id, [...sessions.values()].map(value => ({ id: value.id,
            ...(value.handler.page.status !== undefined ? { url: value.handler.page.url } : {}) })));
        }
        if (typeof args.id !== 'string') return toolResult(request.id, "missing required argument 'id'", true);
        if (args.id === 'default') return toolResult(request.id, 'the default session cannot be closed', true);
        if (!dispose(args.id)) return toolResult(request.id, `session ${args.id} not found`, true);
        return toolResult(request.id, `closed session ${args.id}`);
      }
    }
    const response = await session.handler.handle(request);
    if (request?.method === 'tools/list' && response?.result?.tools) {
      response.result.tools = response.result.tools.map(tool => tool.name.startsWith('session_')
        ? { ...tool, description: ({ session_new: 'Create or reuse an isolated browsing session.', session_list: 'List active sessions and their loaded URLs.', session_close: 'Close a named browsing session.' })[tool.name] }
        : tool);
    }
    return response;
  }

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !remoteAllowOrigins.includes('*') && !remoteAllowOrigins.includes(origin)) {
      send(response, 403, 'Origin not allowed\n', { connection: 'close' }); return;
    }
    let url;
    try { url = new URL(request.url, 'http://localhost'); } catch { send(response, 400, 'Invalid URL\n'); return; }
    if (url.pathname !== '/mcp') { send(response, 404, 'Not found\n'); return; }
    if (!['POST', 'DELETE'].includes(request.method)) { send(response, 405, undefined, { allow: 'POST, DELETE' }); return; }
    expireIdle();
    const header = request.headers['mcp-session-id'];
    if (header !== undefined && !validSessionId(header)) { send(response, 400, 'Invalid session id\n'); return; }
    if (request.method === 'DELETE') {
      if (header && header !== 'default') dispose(header);
      send(response, 202); return;
    }
    if (header && expired.has(header)) { send(response, 404, 'Session expired, start a new one\n'); return; }
    if (header && strictUnknownSessions && !sessions.has(header)) { send(response, 404, 'Unknown session\n'); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
      send(response, 415, 'Content-Type must be application/json\n'); return;
    }
    let message;
    try { message = JSON.parse(await readBody(request, maxBodyBytes)); }
    catch (error) {
      send(response, error.httpStatus ?? 400,
        error.httpStatus ? error.message : rpcError(null, -32700, 'Parse error'), { connection: 'close' }); return;
    }
    let id = header ?? (message?.method === 'initialize' && message.id !== undefined ? nextId() : 'default');
    let session = sessions.get(id);
    if (!session) session = create(id);
    session.lastActive = Date.now(); session.busy++;
    const work = session.tail.then(() => dispatch(session, message));
    session.tail = work.catch(() => {});
    try {
      const result = await work;
      send(response, result === undefined ? 202 : 200, result, { 'content-type': 'application/json', 'mcp-session-id': id,
        ...(origin ? { 'access-control-allow-origin': origin } : {}) });
    } catch (error) { send(response, 200, rpcError(message?.id, -32603, error.message), { 'mcp-session-id': id }); }
    finally { session.busy--; session.lastActive = Date.now(); }
  });

  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
  catch (error) {
    clearInterval(timer);
    for (const session of sessions.values()) session.handler.close();
    if (ownsBrowser) browser.close();
    throw error;
  }
  return {
    server, browser, host, port: server.address().port,
    close() {
      if (closing) return closing;
      closing = (async () => {
        clearInterval(timer);
        for (const session of sessions.values()) session.handler.close();
        sessions.clear();
        if (ownsBrowser) browser.close();
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      })();
      return closing;
    },
  };
}
