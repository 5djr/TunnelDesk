const net = require("net");

// Measures real application-layer round-trip time rather than plain TCP connect
// time.  A plain TCP connect to localhost always resolves in ~1 ms because
// cloudflared accepts the socket locally without going through Cloudflare first.
//
// RDP  → sends a minimal TPKT/X.224 Connection Request (19 bytes) and waits
//         for the server's Connection Confirm.  The full exchange traverses the
//         Cloudflare tunnel, giving a true end-to-end RTT.
// SSH  → server sends its version banner immediately on connect (no client
//         packet needed); waiting for that first data chunk gives the RTT.
// Telnet → same as SSH: server speaks first with option negotiations.
// Others → falls back to TCP connect time (still useful for direct connections).
function measureRoundTripLatency(host, port, protocol) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let done = false;

    const finish = (ms) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ms);
    };

    const timer = setTimeout(() => finish(null), 5000);

    // socket.connect can throw synchronously for invalid arguments, before the
    // 'error' event listener below has a chance to fire.
    try {
      socket.connect(port, host, () => {
        if (protocol === "rdp-cf" || protocol === "rdp") {
          // Minimal X.224 CR inside a TPKT frame.  The remote RDP server replies
          // with an X.224 CC packet — that reply crosses the whole tunnel.
          socket.write(
            Buffer.from([
              0x03,
              0x00,
              0x00,
              0x13, // TPKT: ver=3, rsvd=0, len=19
              0x0e,
              0xe0, // X.224: LI=14, code=CR (Connection Request)
              0x00,
              0x00, // dst-ref = 0
              0x00,
              0x00, // src-ref = 0
              0x00, // class = 0
              0x01,
              0x00,
              0x08,
              0x00, // RDP_NEG_REQ: type=1, flags=0, len=8
              0x03,
              0x00,
              0x00,
              0x00, // requestedProtocols: SSL | CredSSP
            ]),
          );
        }
        // SSH / Telnet: server sends first (banner / option negotiations).
        // HTTP direct: server waits for a request — we let the timeout handle it
        // and report null (no active session to measure anyway).
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }

    socket.on("data", () => {
      clearTimeout(timer);
      finish(Date.now() - start);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}

module.exports = { measureRoundTripLatency };
