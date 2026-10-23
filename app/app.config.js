/* app.json is the config; this only decides which RevenueCat key a build gets.
   Test Store key (purchases are simulated, no store setup) for preview/device builds and local runs.
   The store keys (extra.rcKeys) for production. RevenueCat closes any release build that uses a Test Store key,
   so test builds also get plugins/with-rc-test.js, which marks the APK debuggable (the SDK's only check). */
module.exports = ({ config }) => {
  const prof = process.env.EAS_BUILD_PROFILE || '';
  const flag = process.env.AE_RC_TEST;
  const test = flag === '1' || (flag !== '0' && prof !== 'production');
  const plugins = [...(config.plugins || [])];
  if (test) plugins.push('./plugins/with-rc-test');
  return { ...config, plugins, extra: { ...config.extra, rcTest: test } };
};
