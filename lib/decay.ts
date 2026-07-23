import { DECAY_WINDOW_MINUTES } from '@/constants/locations';
import type { Sighting } from './firestore';

export const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/** Returns a weight between 0 and 1. Decays linearly to 0 over windowMinutes. */
export function pinWeight(createdAt: Date, windowMinutes = DECAY_WINDOW_MINUTES): number {
  const ageMinutes = (Date.now() - createdAt.getTime()) / 60000;
  return Math.min(1, Math.max(0, 1 - ageMinutes / windowMinutes));
}

/** Converts active sightings to a Mapbox GeoJSON FeatureCollection with decay weights. */
export function sightingsToGeoJSON(sightings: Sighting[], windowMinutes = DECAY_WINDOW_MINUTES): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sightings
      .map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
        properties: { weight: pinWeight(s.createdAt, windowMinutes) },
      }))
      .filter((f) => f.properties.weight > 0),
  };
}
