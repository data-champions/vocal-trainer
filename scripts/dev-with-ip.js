#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const os = require('os');



function getLocalIP() {
  const ifaces = os.networkInterfaces();
  let ipAddress;

  Object.keys(ifaces).forEach((ifname) => {
    ifaces[ifname].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = iface.address;
      }
    });
  });

  return ipAddress;
}

console.log(`Local IP Address: ${getLocalIP()}`);


function getNetworkUrl(port) {
  try {
    // Try to find a non-internal IPv4 address from available interfaces (works on macOS/Linux/Windows)
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal && net.address) {
          return `http://${net.address}:${port}`;
        }
      }
    }

    // Fallback to Linux route lookup
    const ip = execSync("ip route get 1 | awk '{print $7}'", { encoding: 'utf8' })
      .trim()
      .split(/\s+/)[0];
    if (ip) return `http://${ip}:${port}`;
  } catch (err) {
    // best-effort; fall through to MAC-os resolution
    return getLocalIP()
  }
  return null;
}

const port = process.env.PORT || '8501';
const networkUrl = getNetworkUrl(port);

console.log(`Local:   http://localhost:${port}`);
if (networkUrl) {
  console.log(`Network: ${networkUrl}`);
} else {
  console.log('Network: (IP not detected)');
}
console.log('');
