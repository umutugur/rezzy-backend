const { notarize } = require("@electron/notarize");

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
    msg.includes("ENOTFOUND")
  );
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;

  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    throw new Error(
      "Missing notarization env vars: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID"
    );
  }

  const attempts = 5;

  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`[notarize] attempt ${i}/${attempts}`);
      await notarize({
        appPath,
        appleId: APPLE_ID,
        appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
        teamId: APPLE_TEAM_ID,
      });
      console.log("[notarize] success");
      return;
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[notarize] failed attempt ${i}/${attempts}: ${msg}`);

      // Network flake değilse hemen patlat (yanlış secret / auth / config vs.)
      if (!isNetworkFlake(err)) throw err;

      if (i === attempts) throw err;

      // 30s, 60s, 90s, 120s...
      const waitMs = 30000 * i;
      console.log(`[notarize] network flake -> retry in ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
};