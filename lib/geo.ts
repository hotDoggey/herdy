import type { AppLocation } from '@/constants/locations';

type LngLat = [number, number];

function perimeterToRing(
  polygon: AppLocation['perimeterPolygon'],
  clockwise: boolean,
): LngLat[] {
  const ring: LngLat[] = polygon.map((p) => [p.lng, p.lat]);
  if (clockwise) ring.reverse();
  ring.push(ring[0]); // close the ring
  return ring;
}

// World-spanning outer ring (CCW) used as the fill's exterior so only the
// area outside the perimeter polygon gets the dark overlay.
const WORLD_RING: LngLat[] = [
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90],
];

/**
 * Returns two GeoJSON shapes for a location's perimeter:
 *   mask   – world polygon with a hole punched out at the perimeter (for the dark outside fill)
 *   border – plain polygon of the perimeter (for the dotted line)
 */
export function buildBoundaryGeoJSON(location: AppLocation): {
  mask: GeoJSON.Feature<GeoJSON.Polygon>;
  border: GeoJSON.Feature<GeoJSON.Polygon>;
} {
  const { perimeterPolygon } = location;

  // Hole must be clockwise so the fill-nonzero rule creates a cutout
  const holeRing = perimeterToRing(perimeterPolygon, true);
  const borderRing = perimeterToRing(perimeterPolygon, false);

  return {
    mask: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [WORLD_RING, holeRing],
      },
    },
    border: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [borderRing],
      },
    },
  };
}

// Ray-casting algorithm — returns true if [lat, lng] is inside the polygon.
export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: { lat: number; lng: number }[],
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = polygon[i].lat, xi = polygon[i].lng;
    const yj = polygon[j].lat, xj = polygon[j].lng;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

interface Locatable {
  id: string;
  lat: number;
  lng: number;
}

/**
 * BFS cluster expansion. Seeds with items within tapRadiusM of the tap point,
 * then repeatedly grows the cluster by finding unvisited items within
 * expansionRadiusM of any already-found item — until nothing new is added.
 */
export function expandCluster<T extends Locatable>(
  tapLat: number,
  tapLng: number,
  items: T[],
  tapRadiusM: number,
  expansionRadiusM: number,
): T[] {
  const inCluster = new Set<string>();
  const result: T[] = [];
  const queue: T[] = [];

  for (const item of items) {
    if (haversineDistance(tapLat, tapLng, item.lat, item.lng) <= tapRadiusM) {
      inCluster.add(item.id);
      result.push(item);
      queue.push(item);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const item of items) {
      if (inCluster.has(item.id)) continue;
      if (haversineDistance(current.lat, current.lng, item.lat, item.lng) <= expansionRadiusM) {
        inCluster.add(item.id);
        result.push(item);
        queue.push(item);
      }
    }
  }

  return result;
}

export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
