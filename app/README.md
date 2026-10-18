# Empire Auction Tycoon: native app (V2)

The app is the same game as the web (`public/index.html`) inside a Capacitor shell, plus a small native bridge (`src/bridge.js`).

## Build
Needs Node 20+, Xcode (iOS, on a Mac) and Android Studio.

```
cd app
npm install
npx cap add ios        # first time only
npx cap add android    # first time only
npm run ios            # copies the game into www/, syncs, opens Xcode
npm run android        # same for Android Studio
```

`npm run build` copies `../public/index.html` into `www/` and injects, before the game script:
- `window.EAT_API` = the Railway server (override with `EAT_API=https://… npm run build`), used for play stats, the showdown board, groups and photos;
- `capacitor.js` and `bridge.js`.

## What the bridge does
- **In-app purchases** via RevenueCat (`@revenuecat/purchases-capacitor`). Put your public keys in `RC_KEYS` in `src/bridge.js`. Product ids must match the game's `IAP` catalogue (`remove_ads`, `regos_10`, `cash_small`, `cash_large`, `rescue`, `rate_lock`, `finish_works`, plus the cosmetics and season pass listed in the main README). Without keys the shop stays hidden, same as the web.
- **Haptics**: `navigator.vibrate` is mapped to Capacitor Haptics, so the game's patterns (bid tap, outbid double tap, final-call heartbeat, gavel thud) work on iPhone too.
- **Push**: asks permission, registers, and POSTs `{installId, token, platform}` to `/api/push`. The server stores tokens; sending needs APNs/FCM credentials (see main README).
- **Deep links**: `https://<your domain>/join/CODE` and `eat://join/CODE` open the group join sheet. Set up Universal Links (apple-app-site-association) and Android App Links (assetlinks.json) on the domain; the server already serves `/join/CODE` as a web fallback.

## Store checklist
- App Store Connect + Play Console listings, age rating (no real-money gambling; nothing random is sold).
- Create the IAP products, then the RevenueCat offerings.
- APNs key + Firebase project for push.
- Privacy: anonymous install id only; no personal data collected.
