# Auction Empires: native app (Expo)

One Expo app for iOS and Android. It loads the live game (`extra.gameUrl` in `app.json`, the Railway site) in a WebView and adds what the web can't do: in-app purchases through RevenueCat, push tokens for APNs/FCM, haptics, native share of cards and win clips, the store rating sheet, and deep links. The game itself never ships inside the binary, so game updates never need an app release.

## Build in the cloud (no Mac needed)
Builds run on EAS. Once, on expo.dev: create a project (slug `auction-empires`), link the GitHub repo `CreatorSenseAI/dopamine-property` (base directory `app`), and put the project id into `app.json` → `extra.eas.projectId`. Then:

```
cd app
npx expo install --fix          # pins every package to the SDK (run once in a sandbox or locally, commit package.json)
eas build -p android --profile preview    # APK for your phone, no store account needed
eas build -p ios --profile preview        # iOS simulator build (EAS cloud simulator can run it)
eas build -p ios --profile device         # needs the Apple Developer account; EAS makes the certificates
eas build --profile production            # store builds; eas submit sends them
```

Claude can trigger the same builds, run them on an EAS cloud simulator, and submit them, from the Expo MCP.

## Keys to add (all optional until you have them)
- `extra.rcKeys.ios` / `.android` in `app.json`: RevenueCat public keys. Without them the shop stays a preview, same as the web.
- Android push: a Firebase project's `google-services.json` in `app/` and `"android": {"googleServicesFile": "./google-services.json"}` in `app.json`. iOS push needs only the APNs key on the server (`APNS_*`); EAS sets the push capability.
- Universal links: `associatedDomains` and the Android `intentFilters` in `app.json` point at the Railway host. When the real domain lands, change them and serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from `server.js` (needs the Apple team id and the Android signing cert fingerprint from EAS credentials).

## The contract with the game (see the main README)
`App.js` injects `window.DPStore` (`available`, `products`, `buy`, `owned`, `restore`, `review`), `window.EAT_API` (the server), replaces `navigator.vibrate` with haptics and `navigator.share` with the native sheet (files included), and posts `{installId, token, platform, tzo}` to `/api/push` after the game reports its install id. `window.EAT_JOIN(code)` is called for `/join/CODE` links and notification taps carrying `{join}`.

Product ids in App Store Connect, Play Console and RevenueCat must match the game's `IAP` catalogue: `remove_ads`, `regos_10`, `slots_10`, `market_5`, `cash_1`…`cash_8`, `season_pass`, `cosmetic_pack`, `city_pass`, `finish_works`, `double_back`.
