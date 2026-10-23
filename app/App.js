/* Auction Empires native app: an Expo shell that loads the live game in a WebView and gives it what the web can't do:
   in-app purchases (RevenueCat), push tokens (APNs/FCM, sent to /api/push), haptics, native share of cards and clips,
   the store rating sheet, and deep links (https://<host>/join/CODE, auctionempires://join/CODE).
   The game talks to this file through window.DPStore and a few hooks; the contract is in the main README. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as StoreReview from 'expo-store-review';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import Purchases, { LOG_LEVEL, PRODUCT_CATEGORY } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
/* getProducts defaults to subscriptions on Android: fetch one-off items (cash packs, boosts) and subscriptions, one list */
const getAll = async ids => { const out = [], seen = new Set(); for (const c of [PRODUCT_CATEGORY.NON_SUBSCRIPTION, PRODUCT_CATEGORY.SUBSCRIPTION]) { try { for (const p of await Purchases.getProducts(ids, c)) if (!seen.has(p.identifier)) { seen.add(p.identifier); out.push(p); } } catch (e) {} } return out; };

const EXTRA = (Constants.expoConfig && Constants.expoConfig.extra) || {};
const GAME_URL = EXTRA.gameUrl || 'https://game-production-ee8e.up.railway.app';
const GAME_HOST = new URL(GAME_URL).host;
/* Test builds (preview/device/local, see app.config.js) use the RevenueCat Test Store key: simulated purchases, no store setup.
   Store builds use the platform keys (goog_… / appl_…) from extra.rcKeys. */
const RC_TEST = !!EXTRA.rcTest;
/* Store builds: a key baked into app.json wins, else the server hands out the public key set in Railway (GET /api/rc),
   so a new or rotated key needs no new build. Test builds always use the Test Store key. */
const rcKey = async () => {
  if (RC_TEST) return EXTRA.rcTestKey || '';
  const built = (EXTRA.rcKeys || {})[Platform.OS];
  if (built) return built;
  try { const r = await fetch(GAME_URL + '/api/rc', { cache: 'no-store' }); const j = await r.json(); return (j && j[Platform.OS]) || ''; } catch (e) { return ''; }
};
/* Pro = one entitlement, sold as a monthly subscription or a lifetime purchase (products monthly / lifetime in the default offering). */
const PRO = EXTRA.rcEntitlement || 'auction_empire_pro';
const proOf = (ci) => {
  const e = ci && ci.entitlements && ci.entitlements.active ? ci.entitlements.active[PRO] : null;
  return e ? { on: true, prod: e.productIdentifier || '', life: !e.expirationDate, until: e.expirationDateMillis || 0, renew: !!e.willRenew, store: e.store || '', sandbox: !!e.isSandbox, test: RC_TEST }
    : { on: false, test: RC_TEST };
};
const PW = { [PAYWALL_RESULT.PURCHASED]: 'purchased', [PAYWALL_RESULT.RESTORED]: 'restored', [PAYWALL_RESULT.CANCELLED]: 'cancelled', [PAYWALL_RESULT.NOT_PRESENTED]: 'not_presented', [PAYWALL_RESULT.ERROR]: 'error' };
const NON_CONSUMABLE = ['remove_ads', 'cosmetic_pack'];

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });

/* Runs inside the page before the game script. Everything the game calls resolves through postMessage round trips. */
const BRIDGE = `(function(){
 if(window.DPStore)return;
 var seq=0,pend={};
 function rpc(k,a){return new Promise(function(res,rej){var id=++seq;pend[id]={res:res,rej:rej};window.ReactNativeWebView.postMessage(JSON.stringify({id:id,k:k,a:a||{}}));setTimeout(function(){if(pend[id]){pend[id].rej(new Error('timeout'));delete pend[id];}},90000);});}
 function post(k,a){try{window.ReactNativeWebView.postMessage(JSON.stringify({k:k,a:a||{}}));}catch(e){}}
 window.__dpResolve=function(id,ok,v){var p=pend[id];if(!p)return;delete pend[id];if(ok)p.res(v);else p.rej(new Error(v||'bridge'));};
 window.EAT_API=${JSON.stringify(GAME_URL)};
 window.EAT_NATIVE={platform:${JSON.stringify(Platform.OS)}};
 window.DPStore={available:function(){return rpc('available');},pro:function(){return rpc('pro');},paywall:function(){return rpc('paywall');},manage:function(){return rpc('manage');},products:function(ids){return rpc('products',{ids:ids});},buy:function(id){return rpc('buy',{id:id});},owned:function(){return rpc('owned');},restore:function(){return rpc('restore');},review:function(){post('review');}};
 navigator.vibrate=function(p){post('haptic',{p:p});return true;};
 navigator.canShare=function(){return true;};
 navigator.share=function(d){d=d||{};var f=d.files&&d.files[0];if(!f)return rpc('share',{text:d.text||'',url:d.url||''});
  return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){rpc('share',{text:d.text||'',url:d.url||'',name:f.name||'share.png',type:f.type||'image/png',dataUrl:r.result}).then(res,rej);};r.onerror=function(){rej(new Error('read'));};r.readAsDataURL(f);});};
 function ready(){var id=null;try{id=localStorage.getItem('dp-install');}catch(e){}post('ready',{installId:id,tzo:-new Date().getTimezoneOffset()});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();`;
/* Insets: the game pads itself with --sat/--sab. Android WebViews report the system bars through env() whether or not
   the view actually sits under them, which doubled the padding on Samsung. Work out what really overlaps: compare the page's
   height with the screen and set --sat/--sab to exactly that. */
const insetJS = (ins, sh) => `(function(){var T=${Math.round(ins.top)},B=${Math.round(ins.bottom)},SH=${Math.round(sh)};
 function fix(){try{var h=window.innerHeight,gap=SH-h,t=T,b=B;
  if(gap>=T+B-6){t=0;b=0;}else if(gap<=6){t=T;b=B;}else if(Math.abs(gap-T)<=8){t=0;b=B;}else if(Math.abs(gap-B)<=8){t=T;b=0;}
  window.EAT_INSETS={top:t,bottom:b,gap:gap,T:T,B:B};var st=document.getElementById('eatInsets');if(!st){st=document.createElement('style');st.id='eatInsets';(document.head||document.documentElement).appendChild(st);}
  st.textContent=':root{--sat:'+t+'px!important;--sab:'+b+'px!important}';}catch(e){}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fix);else fix();window.addEventListener('resize',fix);})();true;`;

const hapticFor = (p) => {
  const arr = Array.isArray(p) ? p : [p]; const on = arr.filter((_, i) => i % 2 === 0); const strongest = Math.max(0, ...on);
  if (on.length >= 4) return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  if (strongest >= 60) return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  if (strongest >= 30) return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><Shell /></SafeAreaProvider>;
}

function Shell() {
  const ins = useSafeAreaInsets();
  const web = useRef(null);
  const installId = useRef(null);
  const rcReady = useRef(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  const run = useCallback((js) => { if (web.current) web.current.injectJavaScript(js + ';true;'); }, []);
  const resolve = useCallback((id, ok, value) => { if (id != null) run(`window.__dpResolve(${id},${ok ? 'true' : 'false'},${JSON.stringify(value === undefined ? null : value)})`); }, [run]);

  const initPurchases = useCallback(async () => {
    if (rcReady.current) return rcReady.current;
    rcReady.current = (async () => {
      const RC_KEY = await rcKey();
      if (!RC_KEY) return false;
      try {
        Purchases.setLogLevel(RC_TEST || __DEV__ ? LOG_LEVEL.VERBOSE : LOG_LEVEL.WARN);
        /* the game's install id is the RevenueCat user, so purchases follow a transferred game */
        Purchases.configure({ apiKey: RC_KEY, appUserID: installId.current || undefined });
        /* every renewal, expiry, refund or purchase made anywhere reaches the game */
        Purchases.addCustomerInfoUpdateListener((ci) => run(`window.EAT_PRO&&window.EAT_PRO(${JSON.stringify(proOf(ci))})`));
        return true;
      } catch (e) { return false; }
    })();
    return rcReady.current;
  }, [run]);

  const owned = useCallback(async () => {
    const ci = await Purchases.getCustomerInfo();
    const ids = new Set(Object.keys((ci.entitlements && ci.entitlements.active) || {}));
    for (const id of ci.allPurchasedProductIdentifiers || []) if (NON_CONSUMABLE.includes(id)) ids.add(id);
    return Array.from(ids);
  }, []);

  const registerPush = useCallback(async () => {
    try {
      if (!Device.isDevice) return;
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
      if (status !== 'granted') return;
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Auctions', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#f2c14e' });
      const tok = await Notifications.getDevicePushTokenAsync();
      if (!tok || !tok.data || !installId.current) return;
      await fetch(GAME_URL + '/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installId: installId.current, token: String(tok.data), platform: Platform.OS, tzo: -new Date().getTimezoneOffset() }) });
    } catch (e) { /* no push, no problem */ }
  }, []);

  const onMessage = useCallback(async (ev) => {
    let m; try { m = JSON.parse(ev.nativeEvent.data); } catch (e) { return; }
    const { id, k, a } = m;
    try {
      if (k === 'ready') { installId.current = a.installId || installId.current; registerPush(); initPurchases(); return; }
      if (k === 'haptic') { hapticFor(a.p).catch(() => {}); return; }
      if (k === 'review') { if (await StoreReview.hasAction()) StoreReview.requestReview(); return; }
      if (k === 'available') return resolve(id, true, await initPurchases());
      if (k === 'products') { const list = await getAll(a.ids || []); return resolve(id, true, list.map(p => ({ id: p.identifier, price: p.priceString }))); }
      if (k === 'buy') {
        try { const list = await getAll([a.id]); const prod = list[0]; if (!prod) return resolve(id, true, { ok: false });
          await Purchases.purchaseStoreProduct(prod); return resolve(id, true, { ok: true }); }
        catch (e) { return resolve(id, true, { ok: false, cancelled: !!(e && e.userCancelled) }); }
      }
      if (k === 'owned') return resolve(id, true, await owned());
      if (k === 'pro') { if (!(await initPurchases())) return resolve(id, true, { on: false, off: true }); return resolve(id, true, proOf(await Purchases.getCustomerInfo())); }
      if (k === 'paywall') {
        /* RevenueCat Paywall for the current offering (built in the dashboard). Shown only when Pro isn't active. */
        if (!(await initPurchases())) return resolve(id, true, { result: 'error', msg: 'store off' });
        try {
          const r = await RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: PRO, displayCloseButton: true });
          return resolve(id, true, { result: PW[r] || String(r), pro: proOf(await Purchases.getCustomerInfo()) });
        } catch (e) { return resolve(id, true, { result: 'error', msg: String(e && e.message || e) }); }
      }
      if (k === 'manage') {
        /* Customer Center: manage or cancel the subscription, restore, refunds, contact, all inside the app */
        if (!(await initPurchases())) return resolve(id, true, { on: false });
        try { await RevenueCatUI.presentCustomerCenter(); } catch (e) { /* falls through to the latest state */ }
        return resolve(id, true, proOf(await Purchases.getCustomerInfo()));
      }
      if (k === 'restore') { await Purchases.restorePurchases(); return resolve(id, true, await owned()); }
      if (k === 'share') {
        if (a.dataUrl) {
          const base64 = a.dataUrl.split(',')[1] || '', ext = /mp4|webm/.test(a.type || '') ? (a.type.includes('webm') ? 'webm' : 'mp4') : 'png';
          const uri = FileSystem.cacheDirectory + 'share-' + Date.now() + '.' + ext;
          await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
          if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: a.type || 'image/png', dialogTitle: 'Auction Empires', UTI: ext === 'png' ? 'public.png' : 'public.movie' });
          else await Share.share({ message: [a.text, a.url].filter(Boolean).join(' ') });
        } else await Share.share({ message: [a.text, a.url].filter(Boolean).join(' '), url: a.url || undefined });
        return resolve(id, true, true);
      }
    } catch (e) { resolve(id, false, String(e && e.message || e)); }
  }, [initPurchases, owned, registerPush, resolve]);

  /* deep links: https://<host>/join/CODE, auctionempires://join/CODE, and notification taps carrying {join} */
  const openJoin = useCallback((url) => { const m = /\/join\/([A-Z0-9-]+)/i.exec(url || ''); if (m) run(`window.EAT_JOIN&&window.EAT_JOIN(${JSON.stringify(m[1].toUpperCase())})`); }, [run]);
  useEffect(() => {
    Linking.getInitialURL().then(openJoin).catch(() => {});
    const sub = Linking.addEventListener('url', e => openJoin(e.url));
    const nsub = Notifications.addNotificationResponseReceivedListener(r => { const d = (r.notification.request.content.data || {}); if (d.join) openJoin('/join/' + d.join); });
    const asub = AppState.addEventListener('change', s => { if (s === 'active') run('document.dispatchEvent(new Event("visibilitychange"))'); });
    return () => { sub.remove(); nsub.remove(); asub.remove(); };
  }, [openJoin, run]);

  const onShouldStart = useCallback((req) => {
    try { const u = new URL(req.url); if (u.host === GAME_HOST || u.protocol === 'about:' || u.protocol === 'blob:' || u.protocol === 'data:') return true; WebBrowser.openBrowserAsync(req.url).catch(() => Linking.openURL(req.url)); return false; }
    catch (e) { return true; }
  }, []);

  if (failed) return (
    <SafeAreaView style={styles.err}>
      <Text style={styles.errH}>Auction Empires</Text>
      <Text style={styles.errP}>The auction room needs the internet. Check your connection and try again.</Text>
      <TouchableOpacity style={styles.btn} onPress={() => { setFailed(false); setNonce(n => n + 1); }}><Text style={styles.btnT}>Try again</Text></TouchableOpacity>
    </SafeAreaView>
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
        <WebView
          key={nonce}
          ref={web}
          source={{ uri: GAME_URL + '/?app=' + Platform.OS }}
          style={styles.web}
          injectedJavaScriptBeforeContentLoaded={BRIDGE + insetJS(ins, Dimensions.get('screen').height)}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStart}
          onError={() => setFailed(true)}
          onHttpError={(e) => { if (e.nativeEvent.statusCode >= 500) setFailed(true); }}
          originWhitelist={['https://*', 'about:*', 'blob:*', 'data:*']}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          bounces={false}
          overScrollMode="never"
          textZoom={100}
          domStorageEnabled
          javaScriptEnabled
          sharedCookiesEnabled
          cacheEnabled
          pullToRefreshEnabled={false}
          allowsLinkPreview={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1324' },
  web: { flex: 1, backgroundColor: '#0b1324' },
  err: { flex: 1, backgroundColor: '#0b1324', alignItems: 'center', justifyContent: 'center', padding: 28 },
  errH: { color: '#f2c14e', fontSize: 26, fontWeight: '800', marginBottom: 10 },
  errP: { color: '#c7d0de', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  btn: { backgroundColor: '#d7263d', paddingVertical: 12, paddingHorizontal: 26, borderRadius: 10 },
  btnT: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
