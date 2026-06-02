// Launches bot + dashboard together as a single Railway service
const { spawn } = require('child_process');

function run(label, args) {
  const proc = spawn('node', args, { stdio: 'inherit', env: process.env });
  proc.on('close', code => {
    console.error(`[${label}] exited with code ${code} — restarting in 3s…`);
    setTimeout(() => run(label, args), 3000);
  });
  proc.on('error', err => console.error(`[${label}] error:`, err));
  return proc;
}

run('Bot',       ['index.js']);
run('Dashboard', ['dashboard/server.js']);
