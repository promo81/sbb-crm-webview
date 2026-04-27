/**
 * Expo Config Plugin: aggiunge i blocchi <queries> al AndroidManifest.xml
 * richiesti su Android 11+ (API 30+) per consentire a Linking.canOpenURL /
 * openURL di funzionare con scheme custom e https.
 *
 * Riferimento: https://developer.android.com/training/package-visibility
 *
 * Schemi gestiti:
 *  - https / http   → browser esterno (Chrome ecc.)
 *  - geo            → mappe (qualsiasi app)
 *  - tel / mailto / sms → dialer / mail / sms
 *  - comgooglemaps  → app Google Maps iOS-style (su Android resta utile per
 *                     compatibilità se mai venisse generato)
 * Package espliciti:
 *  - com.google.android.apps.maps → Google Maps Android
 *  - com.android.chrome           → Chrome
 */
const { withAndroidManifest } = require("expo/config-plugins");

const SCHEMES = [
  "https",
  "http",
  "geo",
  "tel",
  "mailto",
  "sms",
  "comgooglemaps",
];

const PACKAGES = ["com.google.android.apps.maps", "com.android.chrome"];

function buildQueriesEntry() {
  const intents = SCHEMES.map((scheme) => ({
    action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
    data: [{ $: { "android:scheme": scheme } }],
  }));

  const packageRefs = PACKAGES.map((pkg) => ({
    $: { "android:name": pkg },
  }));

  return {
    intent: intents,
    package: packageRefs,
  };
}

module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [];

    // Evita duplicati su modify ripetuti (expo prebuild).
    const alreadyAdded = manifest.queries.some(
      (q) =>
        Array.isArray(q.intent) &&
        q.intent.some((i) =>
          (i.data || []).some(
            (d) => d?.$?.["android:scheme"] === "comgooglemaps",
          ),
        ),
    );
    if (alreadyAdded) {
      return cfg;
    }

    manifest.queries.push(buildQueriesEntry());
    return cfg;
  });
};
