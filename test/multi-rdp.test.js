"use strict";

// Cross-platform verification that multiple simultaneous Cloudflare Access RDP
// connections each get their own local port, and that every platform's client
// launcher threads that port through. Runs in a plain Node process (no Electron,
// no node_modules) so the GitHub Actions ubuntu/macos/windows matrix can run it.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const fs = require("node:fs/promises");

const { getFreeLocalPort, pickLoopbackHost } = require("../src/main/net-utils");
const {
  buildXfreeRdpArgs,
  writeTempRdpFile,
  cleanupTempRdpFile,
} = require("../src/main/rdp-helpers");

function listen(port) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

test("getFreeLocalPort returns a valid loopback port", async () => {
  const port = await getFreeLocalPort();
  assert.equal(typeof port, "number");
  assert.ok(port > 0 && port < 65536, `port ${port} out of range`);
  // The returned port must be bindable (i.e. genuinely free at allocation time).
  const srv = await listen(port);
  srv.close();
});

test("two tunnels active at once receive distinct ports", async () => {
  // First tunnel allocates and holds its port, exactly like cloudflared does.
  const p1 = await getFreeLocalPort();
  const holder = await listen(p1);
  try {
    // Second tunnel must not be handed the in-use port — this is the exact
    // collision (127.0.0.1:3389) that broke a second simultaneous connection.
    const p2 = await getFreeLocalPort();
    assert.notEqual(p1, p2, "allocator handed out a port already in use");
    const srv2 = await listen(p2);
    srv2.close();
  } finally {
    holder.close();
  }
});

test("pickLoopbackHost assigns a distinct 127.0.0.x per active tunnel", () => {
  // First connection gets .1, then the allocator fills the lowest free slot —
  // this is what gives each Windows tunnel its own TERMSRV/<ip> credential
  // target so simultaneous RDP logins don't clobber each other.
  assert.equal(pickLoopbackHost([]), "127.0.0.1");
  assert.equal(pickLoopbackHost(["127.0.0.1"]), "127.0.0.2");
  assert.equal(pickLoopbackHost(["127.0.0.1", "127.0.0.2"]), "127.0.0.3");
  // A freed slot is reused rather than skipped.
  assert.equal(pickLoopbackHost(["127.0.0.1", "127.0.0.3"]), "127.0.0.2");
});

test(
  "getFreeLocalPort can bind a non-default loopback host",
  {
    // macOS only configures 127.0.0.1 by default — which is exactly why the
    // production code keeps macOS on 127.0.0.1 and only uses 127.0.0.2+ on
    // Windows. So this binding check only applies off-macOS.
    skip: process.platform === "darwin" ? "127.0.0.2 not configured on macOS" : false,
  },
  async () => {
    const port = await getFreeLocalPort("127.0.0.2");
    assert.ok(port > 0 && port < 65536);
  },
);

test("xfreerdp args target the passed local port (Linux)", () => {
  const argsXf3 = buildXfreeRdpArgs("localhost", 54321, "alice", "secret", "xfreerdp3");
  assert.ok(argsXf3.includes("/v:localhost:54321"), "missing /v target");
  assert.ok(argsXf3.includes("/cert:ignore"), "xfreerdp3 cert flag");
  assert.ok(argsXf3.includes("/u:alice"));

  // Legacy xfreerdp uses the older cert flag spelling.
  const argsXf = buildXfreeRdpArgs("localhost", 11111, "", "", "xfreerdp");
  assert.ok(argsXf.includes("/v:localhost:11111"));
  assert.ok(argsXf.includes("/cert-ignore"), "legacy cert flag");

  // Two connections on different ports produce different targets — no collision.
  const a = buildXfreeRdpArgs("localhost", 40001, "", "", "xfreerdp3");
  const b = buildXfreeRdpArgs("localhost", 40002, "", "", "xfreerdp3");
  assert.notDeepEqual(a, b);
});

test(".rdp file carries the passed local port and is uniquely named (macOS)", async () => {
  const written = [];
  try {
    const f1 = await writeTempRdpFile("conn-A", "localhost", 54321, "alice");
    const f2 = await writeTempRdpFile("conn-B", "localhost", 54322, "bob");
    written.push(f1, f2);

    assert.notEqual(f1, f2, "temp files must not collide");

    const c1 = await fs.readFile(f1, "utf8");
    const c2 = await fs.readFile(f2, "utf8");
    assert.ok(c1.includes("full address:s:localhost:54321"), "port not in .rdp file");
    assert.ok(c1.includes("username:s:alice"));
    assert.ok(c2.includes("full address:s:localhost:54322"));
  } finally {
    await Promise.all(written.map((p) => fs.unlink(p).catch(() => {})));
  }
});

test("cleanupTempRdpFile removes the file after its delay", async () => {
  const f = await writeTempRdpFile("conn-cleanup", "localhost", 50000, "u");
  cleanupTempRdpFile(f, 10);
  await new Promise((r) => setTimeout(r, 60));
  await assert.rejects(fs.access(f), "temp .rdp file should have been removed");
});
