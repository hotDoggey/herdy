/**
 * Config plugin that applies build fixes required by Xcode 16 / RN 0.81 on iOS 26 SDK.
 *
 * All pods:
 *   SWIFT_STRICT_CONCURRENCY=minimal, SWIFT_VERSION=5 — suppresses Swift 6 errors.
 *
 * fmt pod source patch:
 *   Patches ios/Pods/fmt/include/fmt/base.h to force FMT_USE_CONSTEVAL=0 for all
 *   Apple clang versions. The fmt library enables consteval for Apple clang >= 14, but
 *   Xcode 16's clang has a regression where consteval is incorrectly enforced on
 *   runtime arguments. Setting the version ceiling to 99999999 disables it universally.
 *   A preprocessor flag (-DFMT_USE_CONSTEVAL=0) doesn't work because base.h redefines
 *   the macro unconditionally, so the only reliable fix is patching the source.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withBuildFixes(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      if (!podfile.includes('SWIFT_STRICT_CONCURRENCY')) {
        podfile = podfile.replace(
          /(\s+react_native_post_install\([\s\S]*?\)\s*\n)(\s+end\s*\nend)/,
          `$1
    # Swift fixes for Xcode 16 / Swift 6
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |cfg|
        cfg.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
        cfg.build_settings['SWIFT_VERSION'] = '5'
      end
    end

    # Patch fmt/base.h to disable broken consteval in Apple clang 16
    fmt_base = File.join(File.dirname(__FILE__), 'Pods/fmt/include/fmt/base.h')
    if File.exist?(fmt_base)
      content = File.read(fmt_base)
      patched = content.gsub(
        '&& __apple_build_version__ < 14000029L',
        '&& __apple_build_version__ < 99999999L'
      )
      File.write(fmt_base, patched) if patched != content
    end
$2`,
        );
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);
};
