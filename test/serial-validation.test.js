"use strict";

// Verifies the serial input sanitizers in validation.js clamp untrusted input
// (form fields and hand-edited connections.json) to safe values before they
// reach the native serialport binding. Pure leaf module — no Electron, no
// node_modules — so it runs on the full CI matrix.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeSerialPath, sanitizeSerialConfig } = require("../src/main/validation");

test("sanitizeSerialPath accepts Windows and POSIX device paths", () => {
  assert.equal(sanitizeSerialPath("COM3"), "COM3");
  assert.equal(sanitizeSerialPath("\\\\.\\COM23"), "\\\\.\\COM23");
  assert.equal(sanitizeSerialPath("/dev/ttyUSB0"), "/dev/ttyUSB0");
  assert.equal(sanitizeSerialPath("/dev/tty.usbserial-1420"), "/dev/tty.usbserial-1420");
  assert.equal(sanitizeSerialPath("  COM5  "), "COM5"); // trimmed
});

test("sanitizeSerialPath rejects empty and shell-metachar / control input", () => {
  assert.equal(sanitizeSerialPath(""), "");
  assert.equal(sanitizeSerialPath(null), "");
  assert.equal(sanitizeSerialPath("COM3; rm -rf /"), "");
  assert.equal(sanitizeSerialPath("COM3 && echo hi"), "");
  assert.equal(sanitizeSerialPath("COM3`whoami`"), "");
  assert.equal(sanitizeSerialPath("COM3\x00"), "");
  assert.equal(sanitizeSerialPath("a".repeat(300)), ""); // too long
});

test("sanitizeSerialConfig applies defaults for missing/invalid input", () => {
  const c = sanitizeSerialConfig(undefined);
  assert.deepEqual(c, {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none",
    encoding: "utf8",
    dtr: true,
    rts: true,
    localEcho: false,
    lineEnding: "cr",
  });
});

test("sanitizeSerialConfig preserves valid values incl. 1.5 stop bits", () => {
  const c = sanitizeSerialConfig({
    baudRate: 115200,
    dataBits: 7,
    stopBits: 1.5,
    parity: "even",
    flowControl: "rtscts",
    encoding: "latin1",
    dtr: false,
    rts: false,
    localEcho: true,
    lineEnding: "crlf",
  });
  assert.equal(c.baudRate, 115200);
  assert.equal(c.dataBits, 7);
  assert.equal(c.stopBits, 1.5);
  assert.equal(c.parity, "even");
  assert.equal(c.flowControl, "rtscts");
  assert.equal(c.encoding, "latin1");
  assert.equal(c.dtr, false);
  assert.equal(c.rts, false);
  assert.equal(c.localEcho, true);
  assert.equal(c.lineEnding, "crlf");
});

test("sanitizeSerialConfig clamps out-of-range / bogus values to defaults", () => {
  const c = sanitizeSerialConfig({
    baudRate: -1,
    dataBits: 99,
    stopBits: 3,
    parity: "weird",
    flowControl: "magic",
    encoding: "ebcdic",
    lineEnding: "wat",
  });
  assert.equal(c.baudRate, 9600);
  assert.equal(c.dataBits, 8);
  assert.equal(c.stopBits, 1);
  assert.equal(c.parity, "none");
  assert.equal(c.flowControl, "none");
  assert.equal(c.encoding, "utf8");
  assert.equal(c.lineEnding, "cr");
});

test("sanitizeSerialConfig coerces numeric strings (form <select> values)", () => {
  const c = sanitizeSerialConfig({
    baudRate: "57600",
    dataBits: "7",
    stopBits: "2",
  });
  assert.equal(c.baudRate, 57600);
  assert.equal(c.dataBits, 7);
  assert.equal(c.stopBits, 2);
});
