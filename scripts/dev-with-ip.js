#!/usr/bin/env node
const { spawn, execSync } = require('child_process');

function getNetworkUrl(port) {
  try {
    const ip = execSync("ip route get 1 | awk '{print $7}'", { encoding: 'utf8' })
      .trim()
      .split(/\s+/)[0];
    if (ip) return `http://${ip}:${port}`;
  } catch (err) {
    // best-effort; fall through to null
  }
  return null;
}

const port = process.env.PORT || '8501';
const networkUrl = getNetworkUrl(port);

console.log('Starting Next.js dev server...');
console.log(`Local:   http://localhost:${port}`);
if (networkUrl) {
  console.log(`Network: ${networkUrl}`);
} else {
  console.log('Network: (IP not detected)');
}
console.log('');

const devProcess = spawn('next', ['dev', '-p', port, '--hostname', '0.0.0.0'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port },
});

devProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

devProcess.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
