import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { until } from '../src/browser.js';

export async function startReference(binary, { args = [], shutdownGrace = 1500 } = {}) {
  const reservation = http.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const process = spawn(binary, ['serve', '--host', '127.0.0.1', '--port', String(port), ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  process.stderr.on('data', () => {});
  let spawnError;
  process.once('error', error => { spawnError = error; });
  const close = async () => {
    if (process.exitCode !== null || process.signalCode !== null || !process.pid) return;
    const exited = once(process, 'exit');
    process.kill('SIGTERM');
    const force = setTimeout(() => {
      if (process.exitCode === null && process.signalCode === null) process.kill('SIGKILL');
    }, shutdownGrace);
    force.unref();
    try { await exited; } finally { clearTimeout(force); }
  };
  try {
    await until(async () => {
      if (spawnError) throw spawnError;
      if (process.exitCode !== null || process.signalCode !== null) throw new Error('Reference browser exited before readiness');
      try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
    }, { timeout: 10000 });
    return { endpoint: `ws://127.0.0.1:${port}/`, close, process };
  } catch (error) { await close(); throw error; }
}
