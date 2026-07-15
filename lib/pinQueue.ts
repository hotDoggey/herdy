import * as SecureStore from 'expo-secure-store';

import { addSighting } from './firestore';

const QUEUE_KEY = 'herdy.pinQueue';

export interface QueuedPin {
  docId: string;
  locationId: string;
  timezone: string;
  lat: number;
  lng: number;
  herdSize?: string;
  createdAt: string; // ISO string — preserves original drop time for correct Firestore timestamp
}

async function readQueue(): Promise<QueuedPin[]> {
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedPin[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedPin[]): Promise<void> {
  await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueuePin(pin: QueuedPin): Promise<void> {
  const queue = await readQueue();
  if (queue.some((p) => p.docId === pin.docId)) return; // already queued
  queue.push(pin);
  await writeQueue(queue);
}

export async function dequeuePin(docId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((p) => p.docId !== docId));
}

const DECAY_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Attempt to flush all queued offline pins to Firestore.
 * Pins older than the 4-hour decay window are discarded — Firestore rules would
 * reject them and they'd be weight-0 on the heatmap regardless.
 * Failures are left in the queue for the next drain attempt.
 */
export async function drainQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const now = Date.now();
  for (const pin of queue) {
    const age = now - new Date(pin.createdAt).getTime();
    if (age > DECAY_WINDOW_MS) {
      await dequeuePin(pin.docId);
      continue;
    }
    try {
      await addSighting(
        {
          locationId: pin.locationId,
          timezone: pin.timezone,
          lat: pin.lat,
          lng: pin.lng,
          herdSize: pin.herdSize,
        },
        pin.docId,
        new Date(pin.createdAt),
      );
      await dequeuePin(pin.docId);
    } catch {
      // Still offline or transient error — leave in queue, retry on next drain
    }
  }
}
