const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withLoopbackNetwork(config) {
  config = withAndroidManifest(config, android => {
    const application = android.modResults.manifest.application[0].$;
    application['android:networkSecurityConfig'] = '@xml/morrowfolio_network_security';
    application['android:usesCleartextTraffic'] = 'false';
    return android;
  });
  return withDangerousMod(config, ['android', async android => {
    const folder = path.join(android.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(folder, { recursive: true });
    const local = process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === '1';
    const domains = local ? '<domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">127.0.0.1</domain><domain includeSubdomains="false">localhost</domain></domain-config>' : '';
    await fs.writeFile(path.join(folder, 'morrowfolio_network_security.xml'), `<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="false" />${domains}</network-security-config>`);
    return android;
  }]);
};
