// Launches bot + dashboard together as a single service.
// --experimental-sqlite is passed explicitly so node:sqlite works on Node 22
// regardless of whether NODE_OPTIONS is set in the environment.
const { spawn } = require('child_process');

const nodeFlags = ['--experimental-sqlite'];

function run(label, scriptArgs) {
  const args = [...nodeFlags, ...scriptArgs];
  const proc = spawn('node', args, { stdio: 'inherit', env: process.env });
  proc.on('close', code => {
    console.error(`[${label}] exited with code ${code} — restarting in 3s…`);
    setTimeout(() => run(label, scriptArgs), 3000);
  });
  proc.on('error', err => console.error(`[${label}] error:`, err));
  return proc;
}

run('Bot',       ['index.js']);
run('Dashboard', ['dashboard/server.js']);
