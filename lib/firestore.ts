import * as Device from 'expo-device';
import {
  GeoPoint,
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from './firebase';
import { getDeviceId } from './deviceId';
import { MAX_FILTER_WINDOW_MINUTES } from '@/constants/locations';
import { DEBUG } from '@/constants/debug';

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

/** Diagnostic: verifies the Firestore connection with a read and a write. */
export async function pingFirestore(): Promise<void> {
  if (!DEBUG) return;

  const timeout = <T>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error(`timed out after ${ms}ms`)), ms))]);

  console.log('[ping] project:', db.app.options.projectId);

  try {
    console.log('[ping] getDoc start...');
    const snap = await timeout(getDoc(doc(db, 'sightings', '__ping__')), 5000);
    console.log('[ping] getDoc OK — exists:', snap.exists());
  } catch (err: any) {
    console.error('[ping] getDoc FAILED:', err.code ?? err.message);
  }

  try {
    console.log('[ping] addDoc start...');
    const ref = await timeout(
      addDoc(sightingsRef, {
        locationId: '__ping__',
        position: new GeoPoint(0, 0),
        createdAt: Timestamp.now(),
        dateKey: '2000-01-01',
        confirmed: 0,
        isOutOfBounds: false,
        deviceId: '__ping__',
      }),
      5000,
    );
    console.log('[ping] addDoc OK — id:', ref.id);
  } catch (err: any) {
    console.error('[ping] addDoc FAILED:', err.code ?? err.message);
  }
}

/** Returns "YYYY-MM-DD" for today in the given IANA timezone. */
function localDateKey(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

/** Query for active sightings at a location within the decay window. */
function activeSightingsQuery(locationId: string) {
  const cutoff = Timestamp.fromDate(
    new Date(Date.now() - MAX_FILTER_WINDOW_MINUTES * 60 * 1000)
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
  herdSize?: string;
}

/** Locally created pin pending Firestore confirmation. */
export interface PendingPin {
  localId: string;
  docId: string;   // pre-generated before the write so cleanup can match immediately
  locationId: string;
  lat: number;
  lng: number;
  createdAt: Date;
  herdSize?: string;
  deviceId: string;
}

/** Generate a Firestore document ID synchronously, before any async work. */
export function newSightingId(): string {
  return doc(sightingsRef).id;
}

/**
 * Write an anonymous pin drop to Firestore using a caller-supplied document ID.
 * The ID must be pre-generated with newSightingId() before any async work so
 * the pending-pin dedup can match against snapshots without a docId: null phase.
 * Pass createdAt when retrying a queued offline pin so the original drop time is preserved.
 */
export async function addSighting(opts: AddSightingOptions, docId: string, createdAt?: Date): Promise<void> {
  if (DEBUG) console.log('[addSighting] fetching deviceId');
  const deviceId = await getDeviceId();
  if (DEBUG) console.log('[addSighting] calling setDoc, id:', docId);
  const ref = doc(sightingsRef, docId);
  const deviceModel = [Device.brand, Device.modelName].filter(Boolean).join(' ') || 'unknown';
  await setDoc(ref, {
    locationId: opts.locationId,
    position: new GeoPoint(opts.lat, opts.lng),
    createdAt: createdAt ? Timestamp.fromDate(createdAt) : Timestamp.now(),
    dateKey: localDateKey(opts.timezone),
    confirmed: 0,
    isOutOfBounds: false,
    deviceId,
    deviceModel,
    ...(opts.herdSize ? { herdSize: opts.herdSize } : {}),
  });
  if (DEBUG) console.log('[addSighting] setDoc resolved, id:', docId);
}

/** Read a string value from the system_vars collection by document ID. */
export async function getSystemVar(docId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'system_vars', docId));
    if (!snap.exists()) return null;
    const value = snap.data().value;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Read the supporter count from the manually-maintained system_counts document. */
export async function getDonationCount(): Promise<number | null> {
  try {
    const snap = await getDoc(doc(db, 'system_counts', 'kifi_donations_count'));
    if (!snap.exists()) return null;
    const value = snap.data().value;
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}
