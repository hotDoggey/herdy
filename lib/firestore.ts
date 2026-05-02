import {
  GeoPoint,
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from './firebase';
import { getDeviceId } from './deviceId';
import { DECAY_WINDOW_MINUTES } from '@/constants/locations';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Sighting {
  id: string;
  locationId: string;
  // Anonymised drop point — user GPS is never stored, only the confirmed pin
  lat: number;
  lng: number;
  createdAt: Date;
  dateKey: string;       // "YYYY-MM-DD" in the location's local timezone
  herdSize?: string;     // '1-5' | '5-10' | '10+'
  photoUrl?: string;
  confirmed: number;     // count of "still here" taps
  isOutOfBounds: boolean;
  deviceId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const sightingsRef = collection(db, 'sightings');

/** Returns "YYYY-MM-DD" for today in the given IANA timezone. */
function localDateKey(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

/** Query for active sightings at a location within the decay window. */
function activeSightingsQuery(locationId: string) {
  const cutoff = Timestamp.fromDate(
    new Date(Date.now() - DECAY_WINDOW_MINUTES * 60 * 1000)
  );
  return query(
    sightingsRef,
    where('locationId', '==', locationId),
    where('createdAt', '>', cutoff)
  );
}

// ── Reads ──────────────────────────────────────────────────────────────────

/**
 * Subscribe to active sightings for a location in real time.
 * Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeSightings(
  locationId: string,
  onData: (sightings: Sighting[]) => void
): Unsubscribe {
  return onSnapshot(activeSightingsQuery(locationId), (snap) => {
    const sightings: Sighting[] = snap.docs.map((doc) => {
      const d = doc.data();
      const pos = d.position as GeoPoint;
      return {
        id: doc.id,
        locationId: d.locationId as string,
        lat: pos.latitude,
        lng: pos.longitude,
        createdAt: (d.createdAt as Timestamp).toDate(),
        dateKey: d.dateKey as string,
        herdSize: d.herdSize as string | undefined,
        photoUrl: d.photoUrl as string | undefined,
        confirmed: (d.confirmed as number) ?? 0,
        isOutOfBounds: (d.isOutOfBounds as boolean) ?? false,
        deviceId: d.deviceId as string,
      };
    });
    onData(sightings);
  }, (err) => {
    console.error('[Firestore] subscribeSightings error:', err.message);
  });
}

// ── Writes ─────────────────────────────────────────────────────────────────

export interface AddSightingOptions {
  locationId: string;
  timezone: string;
  lat: number;
  lng: number;
  isOutOfBounds?: boolean;
  herdSize?: string;
}

/**
 * Write an anonymous pin drop to Firestore.
 * GPS coordinates are stored only as the pin drop point, never as the
 * user's live location. The deviceId is anonymous and carries no PII.
 */
export async function addSighting(opts: AddSightingOptions): Promise<void> {
  const deviceId = await getDeviceId();
  await addDoc(sightingsRef, {
    locationId: opts.locationId,
    position: new GeoPoint(opts.lat, opts.lng),
    createdAt: serverTimestamp(),
    dateKey: localDateKey(opts.timezone),
    confirmed: 0,
    isOutOfBounds: opts.isOutOfBounds ?? false,
    deviceId,
    ...(opts.herdSize ? { herdSize: opts.herdSize } : {}),
  });
}
