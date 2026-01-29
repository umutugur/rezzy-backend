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
    console.warn(
      "Notarization skipped: Missing APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID"
    );
    return;
  }

  const attempts = 8; // 5 yetmiyor bazen
  for (let i = 1; i <= attempts; i++) {
    try {
      console.log(`[notarize] attempt ${i}/${attempts}`);
      await notarize({
        appPath,
        appleId: APPLE_ID,
        appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
        teamId: APPLE_TEAM_ID
      });
      console.log("[notarize] success");
      return;
    } catch (err) {
      const msg = String(err?.message || err);
      console.error(`[notarize] failed attempt ${i}/${attempts}: ${msg}`);

      if (!isNetworkFlake(err)) {
        // auth/role/agreement vs -> retry etme
        throw err;
      }

      if (i === attempts) throw err;

      const waitMs = Math.min(30000 * i, 180000); // max 3dk
      console.log(`[notarize] network flake -> retry in ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
};
