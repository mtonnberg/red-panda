import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
// Fixture process readiness does not import any candidate engine modules.
const until=async(predicate,{timeout=10000}={})=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Reference readiness timeout');};

export async function startReference(binary, { args = [], shutdownGrace = 1500 } = {}) {
  const reservation = http.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const process = spawn(binary, ['serve', '--host', '127.0.0.1', '--port', String(port), ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr='',stderrTruncated=false;
  process.stderr.on('data', bytes => {const part=bytes.toString();if(stderr.length+part.length>65536)stderrTruncated=true;stderr=(stderr+part).slice(0,65536);});
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
    return { endpoint: `ws://127.0.0.1:${port}/`, close, process, get stderr(){return stderr;},get stderrTruncated(){return stderrTruncated;} };
  } catch (error) { await close(); throw error; }
}
