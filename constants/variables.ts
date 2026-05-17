// Radius (metres) from the tap point to seed the cluster search.
// Increase if taps feel like they miss the herd cluster; decrease to tighten the hitbox.
export const NEARBY_RADIUS_M = 50;

// Radius (metres) used when expanding the cluster from each found pin.
// Pins within this distance of any already-found pin are pulled into the same cluster.
export const CLUSTER_EXPANSION_RADIUS_M = 30;
