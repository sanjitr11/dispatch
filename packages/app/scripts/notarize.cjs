// scripts/notarize.js
// Notarization is skipped in development builds.
// For production releases, add Apple credentials here.
exports.default = async function notarize() {
  if (process.env.SKIP_NOTARIZE) return;
  console.log('Notarization skipped (SKIP_NOTARIZE not set or no credentials)');
};
