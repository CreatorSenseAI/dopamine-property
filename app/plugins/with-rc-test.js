/* Test builds only (see app.config.js). RevenueCat's Android SDK refuses a Test Store key unless the app is
   debuggable (ApplicationInfo.FLAG_DEBUGGABLE). Setting it in the manifest keeps BuildConfig.DEBUG false, so
   React Native still runs the bundled release JS with no dev menu or Metro. Never used for store builds. */
const { withAndroidManifest } = require('expo/config-plugins');
module.exports = function withRcTest(config) {
  return withAndroidManifest(config, (c) => {
    const m = c.modResults.manifest;
    m.$ = m.$ || {};
    m.$['xmlns:tools'] = m.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    const app = (m.application || [])[0];
    if (app) {
      app.$ = app.$ || {};
      app.$['android:debuggable'] = 'true';
      const ig = (app.$['tools:ignore'] || '').split(',').filter(Boolean);
      if (!ig.includes('HardcodedDebugMode')) ig.push('HardcodedDebugMode');
      app.$['tools:ignore'] = ig.join(',');
    }
    return c;
  });
};
