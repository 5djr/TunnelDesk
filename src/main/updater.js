const https = require("https");
const { app } = require("electron");

const REPO = "5djr/TunnelDesk";

function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Returns { version, url } if a newer release exists, or null.
// Fails silently — never throws or rejects.
function checkForUpdate() {
  const current = app.getVersion();
  return new Promise((resolve) => {
    const req = https.get(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: {
          "User-Agent": `TunnelDesk/${current}`,
          Accept: "application/vnd.github.v3+json",
        },
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.on("data", (chunk) => {
          if (body.length < 65536) body += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            const latest = (data.tag_name || "").replace(/^v/, "");
            if (latest && compareVersions(latest, current) > 0) {
              resolve({
                version: latest,
                url:
                  data.html_url ||
                  `https://github.com/${REPO}/releases/latest`,
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

module.exports = { checkForUpdate };
