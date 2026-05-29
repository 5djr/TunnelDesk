"use strict";

const { BrowserWindow, safeStorage } = require("electron");
const fs = require("fs").promises;
const path = require("path");
const { state } = require("./state");

function tokenCachePath() {
  return path.join(state.userDataPath, "auth-cache.enc");
}

let currentUser = null;

async function loadCachedTokens(pca) {
  try {
    const buf = await fs.readFile(tokenCachePath());
    const json = safeStorage.decryptString(buf);
    pca.getTokenCache().deserialize(json);
  } catch {}
}

async function saveTokenCache(pca) {
  try {
    const json = pca.getTokenCache().serialize();
    const encrypted = safeStorage.encryptString(json);
    await fs.writeFile(tokenCachePath(), encrypted);
  } catch {}
}

function buildPca(clientId, tenantId) {
  const { PublicClientApplication } = require("@azure/msal-node");
  return new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId || "common"}`,
    },
  });
}

async function signIn(clientId, tenantId) {
  if (!clientId) throw new Error("Client ID is required");

  let CryptoProvider;
  try {
    ({ CryptoProvider } = require("@azure/msal-node"));
  } catch {
    throw new Error("msal-node is not available — run: npm install @azure/msal-node");
  }

  const pca = buildPca(clientId, tenantId);
  const cryptoProvider = new CryptoProvider();
  const { challenge, verifier } = await cryptoProvider.generatePkceCodes();

  const redirectUri = "http://localhost";
  const authUrl = await pca.getAuthCodeUrl({
    scopes: ["openid", "profile", "email", "offline_access"],
    redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 500,
      height: 680,
      title: "Sign in with Microsoft",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: `persist:msal-${(tenantId || "common").replace(/[^a-z0-9]/gi, "")}`,
      },
      parent: state.mainWindow || undefined,
      modal: false,
      autoHideMenuBar: true,
      resizable: false,
    });

    let settled = false;

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      try {
        win.destroy();
      } catch {}
      fn();
    };

    const handleUrl = async (url) => {
      if (!url.startsWith("http://localhost")) return;
      let code, authError;
      try {
        const parsed = new URL(url);
        code = parsed.searchParams.get("code");
        authError =
          parsed.searchParams.get("error_description") ||
          parsed.searchParams.get("error");
      } catch {
        settle(() => reject(new Error("Invalid redirect URL")));
        return;
      }

      if (authError) {
        settle(() => reject(new Error(authError)));
        return;
      }
      if (!code) return;

      try {
        const result = await pca.acquireTokenByCode({
          code,
          scopes: ["openid", "profile", "email", "offline_access"],
          redirectUri,
          codeVerifier: verifier,
        });
        await saveTokenCache(pca);
        const user = {
          name: result.account?.name || result.account?.username || "Unknown",
          email: result.account?.username || "",
          tenantId: result.account?.tenantId || tenantId || "",
          homeAccountId: result.account?.homeAccountId || "",
        };
        currentUser = user;
        settle(() => resolve(user));
      } catch (err) {
        settle(() => reject(err));
      }
    };

    win.webContents.on("will-redirect", (event, url) => {
      if (url.startsWith("http://localhost")) {
        event.preventDefault();
        void handleUrl(url);
      }
    });

    win.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith("http://localhost")) {
        event.preventDefault();
        void handleUrl(url);
      }
    });

    win.on("closed", () => {
      settle(() => reject(new Error("Sign-in cancelled")));
    });

    win.loadURL(authUrl);
  });
}

async function signOut() {
  currentUser = null;
  try {
    await fs.unlink(tokenCachePath());
  } catch {}
}

async function getAuthStatus(clientId, tenantId) {
  if (currentUser) return { signedIn: true, user: currentUser };
  if (!clientId) return { signedIn: false, user: null };

  try {
    const pca = buildPca(clientId, tenantId);
    await loadCachedTokens(pca);
    const accounts = await pca.getAllAccounts();
    if (!accounts || !accounts.length) return { signedIn: false, user: null };

    const result = await pca.acquireTokenSilent({
      scopes: ["openid", "profile", "email"],
      account: accounts[0],
    });
    await saveTokenCache(pca);

    const user = {
      name: result.account?.name || result.account?.username || "Unknown",
      email: result.account?.username || "",
      tenantId: result.account?.tenantId || tenantId || "",
      homeAccountId: result.account?.homeAccountId || "",
    };
    currentUser = user;
    return { signedIn: true, user };
  } catch {
    return { signedIn: false, user: null };
  }
}

module.exports = { signIn, signOut, getAuthStatus };
