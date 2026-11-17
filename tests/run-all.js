// npm test : starts the local mocks, runs the API, browser and screen-width tests.
import { spawn, spawnSync } from 'node:child_process';
const start = (env = {}) => new Promise((resolve) => {
  const h = spawn('node', ['tests/harness.js'], { env: { ...process.env, ...env } });
  h.stdout.on('data', (d) => { if (String(d).includes('READY')) resolve(h); });
  h.stderr.on('data', (d) => process.stderr.write(d));
});
let failed = false;
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit' }); if (r.status !== 0) failed = true; };

let h = await start();
console.log('\n== API and payment flow =='); run('node', ['tests/api.test.js']);
h.kill(); h = await start();
console.log('\n== Browser journey (390px) =='); run('python3', ['tests/ui_test.py']);
console.log('\n== Screen widths 360 / 390 / 768 / 1440 =='); run('python3', ['tests/widths_test.py']);
h.kill();
console.log(failed ? '\nSOME TESTS FAILED' : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
