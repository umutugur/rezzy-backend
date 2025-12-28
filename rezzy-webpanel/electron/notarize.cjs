const { notarize } = require("@electron/notarize");
const { execSync } = require("child_process");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log("[notarize] appPath:", appPath);

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    throw new Error("Missing env vars: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID");
  }

  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });

  // ✅ Staple (Gatekeeper için kritik)
  console.log("[notarize] stapling...");
  execSync(`xcrun stapler staple -v "${appPath}"`, { stdio: "inherit" });
  console.log("[notarize] done");
};