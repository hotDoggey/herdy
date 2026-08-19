/**
 * Config plugin that forces the main app target to link SwiftUI explicitly.
 *
 * The iOS 26 SDK split SwiftUICore out of SwiftUI.framework and restricts which
 * targets are allowed to link SwiftUICore directly. expo-updates (reload-screen
 * UI) and expo-dev-launcher/expo-dev-menu (SwiftUI debug screens) pull SwiftUI
 * symbols into the final app link, and Xcode's implicit auto-linking resolves
 * them straight to SwiftUICore instead of routing through SwiftUI — which the
 * SDK rejects for a third-party app target with:
 *   "cannot link directly with 'SwiftUICore' because product being built is
 *    not an allowed client of it"
 * Explicitly linking SwiftUI.framework makes the linker resolve those symbols
 * through the allowed path instead.
 */
const { withXcodeProject } = require('@expo/config-plugins');

const APP_TARGET_NAME = 'Herdy';

module.exports = function withSwiftUILinkFix(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;

    for (const buildName of ['Debug', 'Release']) {
      const raw = project.getBuildProperty('OTHER_LDFLAGS', buildName, APP_TARGET_NAME);
      // Entries come back with their .pbxproj quoting intact (e.g. the literal
      // string '"$(inherited)"') — leave existing entries untouched and only
      // append plain, unquoted tokens, which are equally valid array elements.
      const flags = Array.isArray(raw) ? raw.slice() : raw ? [raw] : ['"$(inherited)"'];

      if (!flags.includes('SwiftUI')) {
        flags.push('-framework', 'SwiftUI');
      }

      project.updateBuildProperty('OTHER_LDFLAGS', flags, buildName, APP_TARGET_NAME);
    }

    return config;
  });
};
