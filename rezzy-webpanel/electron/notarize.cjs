/* rezzy-webpanel/electron/notarize.cjs */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function shOut(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isNetworkFlake(err) {
  const msg = String(err?.stack || err?.message || err || "");
  return (
    msg.includes("NSURLErrorDomain Code=-1009") ||
    msg.includes("The Internet connection appears to be offline") ||
    msg.includes("No network route") ||
    msg.includes("statusCode: nil") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("could not be found") // bazı xcrun/network edge durumları
  );
}

async function preflightAppleNotary() {
  // Notary endpoint route kontrolü (401 dönse bile route varsa OK)
  try {
    sh("bash", [
      "-lc",
      `set -e; curl -sS -I --max-time 20 https://appstoreconnect.apple.com/notary/v2/ | head -n 5 || true`,
    ]);
  } catch {
    // preflight fail olursa bile devam; retry mantığı asıl koruma
  }
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    throw new Error("Missing notarization env vars: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID");
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    throw new Error(`App not found at: ${appPath}`);
  }

  const zipPath = path.join(appOutDir, `${appName}.zip`);

  console.log(`[notary] appPath: ${appPath}`);
  console.log(`[notary] zipPath: ${zipPath}`);

  // ZIP üret (keepParent)
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  sh("bash", ["-lc", `ditto -c -k --keepParent "${appPath}" "${zipPath}"`]);

  const attempts = Number(process.env.NOTARY_RETRIES || 6);

  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`[notary] preflight notary route (attempt ${i}/${attempts})`);
      await preflightAppleNotary();

      console.log(`[notary] submit + wait (attempt ${i}/${attempts})`);
      // notarytool submit --wait (timeout ekliyoruz)
      sh("xcrun", [
        "notarytool",
        "submit",
        zipPath,
        "--apple-id",
        APPLE_ID,
        "--team-id",
        APPLE_TEAM_ID,
        "--password",
        APPLE_APP_SPECIFIC_PASSWORD,
        "--wait",
        "--timeout",
        "30m",
      ]);

      console.log("[notary] staple app");
      sh("xcrun", ["stapler", "staple", "-v", appPath]);

      console.log("[notary] validate staple");
      sh("xcrun", ["stapler", "validate", "-v", appPath]);

      console.log("[notary] SUCCESS");
      return;
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[notary] FAILED attempt ${i}/${attempts}: ${msg}`);

      if (i === attempts) throw err;

      // Network flake değilse retry yapma: auth/config hatasını hemen görün
      if (!isNetworkFlake(err)) throw err;

      const waitMs = 30000 * i; // 30s, 60s, 90s...
      console.log(`[notary] network flake -> retry in ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
};