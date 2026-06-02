"use strict";

const net = require("net");

// Ask the OS for an unused TCP port on the loopback interface. Each Cloudflare
// Access tunnel binds its own local listener, so two connections that share the
// same configured port (e.g. RDP's default 3389) would otherwise collide on
// 127.0.0.1:3389. Binding to port 0 lets the kernel hand back a free port, and
// because the kernel never hands out a port that is currently bound, two tunnels
// active at the same time always receive distinct ports.
function getFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

module.exports = { getFreeLocalPort };
