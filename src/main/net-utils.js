"use strict";

const net = require("net");

// Ask the OS for an unused TCP port on the given loopback host. Each Cloudflare
// Access tunnel binds its own local listener, so two connections that share the
// same configured port (e.g. RDP's default 3389) would otherwise collide.
// Binding to port 0 lets the kernel hand back a free port, and because the
// kernel never hands out a port that is currently bound, two tunnels active at
// the same time always receive distinct ports.
function getFreeLocalPort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, host, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Pick the lowest 127.0.0.N loopback address not already in use by an active
// tunnel. Windows mstsc strips the port when looking up a saved RDP credential
// (TERMSRV/<host>), so giving every simultaneous tunnel a distinct loopback IP
// is what keeps each connection's stored credentials from colliding. The whole
// 127.0.0.0/8 range is loopback on Windows and Linux.
function pickLoopbackHost(usedHosts = []) {
  const used = new Set(usedHosts);
  for (let n = 1; n <= 254; n++) {
    const host = `127.0.0.${n}`;
    if (!used.has(host)) return host;
  }
  return "127.0.0.1";
}

module.exports = { getFreeLocalPort, pickLoopbackHost };
