import { DECAY_WINDOW_MINUTES } from '@/constants/locations';
import type { Sighting } from './firestore';

export const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/** Returns a weight between 0 and 1. Decays linearly to 0 over DECAY_WINDOW_MINUTES. */
export function pinWeight(createdAt: Date): number {
  const ageMinutes = (Date.now() - createdAt.getTime()) / 60000;
  return Math.max(0, 1 - ageMinutes / DECAY_WINDOW_MINUTES);
}

/** Converts active sightings to a Mapbox GeoJSON FeatureCollection with decay weights. */
export function sightingsToGeoJSON(sightings: Sighting[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sightings
      .map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
        properties: { weight: pinWeight(s.createdAt) },
      }))
      .filter((f) => f.properties.weight > 0),
  };
}
