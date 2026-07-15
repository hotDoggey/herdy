# Herdy — TODO

### Settings Panel — Remaining Items
The settings screen exists with heatmap colour. Still to add:
- **Notifications:** proximity alert on/off, alert distance (250m / 500m / 1km), quiet hours
- **Rate the app:** deep link to App Store review prompt
- **Feedback / Report a bug:** mailto or in-app form


## Larger Features

### Multi-Species Tagging
Don't lock pins to just cattle — let users tag Laurel Pigeons, raptors, other wildlife. Each species gets its own heatmap colour toggle on the map.

**What needs building:**
- Add a species field to the Firestore sighting document
- Species picker in the pin drop sheet
- Per-species heatmap layers with configurable colours
- Species filter in the on-map filter popup (only show species that exist for the selected location)

### "Best Time to Visit" Chart
Aggregate historical sighting timestamps and show a time-of-day / day-of-week activity chart per location. Answers "when should I go?" — high value, zero ongoing cost once the data exists.

### Offline Cached Feed
Store the last 24h of feed posts locally so the feed loads instantly with no signal on the trail.

### Trail Hazard Reports
"Fallen tree at km 1.5", "washed-out section" — a safety layer on top of the sighting feed. A distinct post type in the social feed. IFCN rangers might promote the app if this exists.

---

## Social & Accounts (sequential — feed → accounts → avatars → premium)

### 1. Social Feed per Location
Reverse-chronological list of active sightings with optional photo, herd size, and a short text note.
- Trail conditions as a distinct post type: "muddy near km 2", "viewpoint clear", "fog incoming"
- Reactions: simple emoji responses (👀 Spotted too / ✅ Still there / ❓ Moved on) — no text required, very low friction
- Comments under each post: short freeform text
- Visibility / fog report: quick one-tap widget at the top of the feed — crowdsourced, timestamp-gated (one per user per 30 min)
- Filtering by type (sightings / conditions / all) and recency

### 2. Content Moderation (free-first strategy)
**Text:**
- Simple keyword blocklist as a first pass
- Apple's on-device NaturalLanguage framework for sentiment / offensive content — free, no network call
- Google Perspective API free tier for toxicity scoring — one API call per post, your backend Firebase Function calls it before writing to Firestore

**Images:**
- Apple Vision framework (VNClassifyImageRequest) on-device — free, instant, no data leaves the phone. First gate.
- Google Cloud Vision SafeSearch: free for the first 1,000 requests/month, $1.50/1,000 after
- Flow: on-device Vision check → if flagged, reject; if passes, upload to Storage → Cloud Function triggers Vision API → if flagged, delete file and hide post

**Home server option:** Run a small CLIP + NSFW classifier (e.g. Falconsai/nsfw_image_detection on Hugging Face) via a simple Flask endpoint while the app is small. Swap out for a cloud service when traffic grows.

### 3. User Accounts & Profiles
- Firebase Anonymous Auth already covers MVP — upgrade path: anonymous → email/Google sign-in, preserving history
- Profile card: display name, chosen avatar, "Ranger rank", sighting count, date joined
- Personal sighting history: "Your pins" — a private list of everything they've dropped
- Saved locations: bookmark a location to get priority notifications when the herd is active

### 4. Avatars & Customisation
**Free tier:**
- 8–10 animal avatars themed to each location (Fanal: Laurel Pigeon, Madeiran Long-eared Bat; Richmond Park: Red Deer, Fox, etc.)
- Location-themed colour palettes for the profile card background

**Premium tier (unlocked by donation or purchase):**
- Animated / foil versions of the same animals
- "Legendary" rare-species avatars (Golden Eagle, Great Bustard, etc.) — one per location, exclusive
- Custom username colour or badge on feed posts
- Profile card background: atmospheric scene art (Fanal fog, Richmond dawn, etc.)

### 5. Monetisation — Ko-fi + In-App Purchase
**Ko-fi webhook flow:**
- User taps "Support on Ko-fi" → opens Ko-fi in browser
- Ko-fi thank-you page includes a one-time deep link back: `herdy://unlock?token=<signed_jwt>`
- A Firebase Cloud Function issues that signed JWT when Ko-fi fires its webhook (~50-line Cloud Function)
- The app receives the deep link, sends the token to the Cloud Function, which writes `premium: true` to Firestore

**Native IAP (one-time unlock):**
- `expo-iap` (maintained successor to expo-in-app-purchases) — wraps StoreKit 2 on iOS and Google Play Billing on Android
- Configure a Non-Consumable product in App Store Connect + Google Play Console ("Herdy Premium", e.g. £2.99)
- Apple takes 30% (15% via Small Business Programme — you almost certainly qualify)
- Both can coexist: Ko-fi → free, IAP → paid, same `premium: true` flag either way

### 6. Gamification & Engagement
- **Ranger Ranks:** Cub Ranger → Ranger → Senior Ranger → Head Ranger — unlocked by sighting count (5 / 25 / 100 / 500)
- **Streak:** "Active 3 days in a row" badge — gentle retention loop
- **First sighting of the day:** a small crown next to the post that first spots the herd each day
- **Community challenges:** "Spot the herd 3 times this week" — tied to the location's activity cycle
- **Leaderboard per location:** top contributors this month — opt-in only
