export const APP_VERSION = '1.0.1';

// Two independent flags for the "Support Herdy" tip prompt, split so either
// can be flipped on its own via `eas update` (JS-only, no rebuild) without
// touching the other. Both false for App Store review submissions per the
// 3.1.1 rejection on 1.0.1 build 6.
//
// - SUPPORT_PROMPT_ENABLED: the periodic prompt shown every other pin drop
//   (app/(tabs)/index.tsx). Intended to come back on after review.
// - SUPPORT_DRAWER_ITEM_ENABLED: the "Support Herdy" row in the side drawer
//   (components/DrawerMenu.tsx). Intended to stay off — kept as a separate
//   flag specifically so it can't accidentally get re-enabled along with the
//   pin-drop prompt.
export const SUPPORT_PROMPT_ENABLED = false;
export const SUPPORT_DRAWER_ITEM_ENABLED = false;

// Radius (metres) from the tap point to seed the cluster search.
// Increase if taps feel like they miss the herd cluster; decrease to tighten the hitbox.
export const NEARBY_RADIUS_M = 50;

// Radius (metres) used when expanding the cluster from each found pin.
// Pins within this distance of any already-found pin are pulled into the same cluster.
export const CLUSTER_EXPANSION_RADIUS_M = 30;
