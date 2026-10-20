/* Native bridge for Auction Empires.
   - window.DPStore: the in-app purchase contract the game expects (see README): available, products, buy, owned, restore.
     Backed by RevenueCat (one SDK for App Store + Google Play). Set your public API keys below.
   - navigator.vibrate → Capacitor Haptics, so the game's haptic patterns work on iOS too.
   - Push: registers for notifications and sends the token to the server (/api/push) with the install id.
   - Deep links: https://<domain>/join/CODE and eat://join/CODE open the group join flow (window.EAT_JOIN). */
(function () {
  const Cap = window.Capacitor; if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  const P = Cap.Plugins || {}, platform = Cap.getPlatform();
  const RC_KEYS = { ios: "appl_REPLACE_ME", android: "goog_REPLACE_ME" };
  /* product ids must match App Store Connect / Play Console and the game's IAP catalogue */
  let ready = null;
  function rc() { return P.Purchases; }
  async function init() {
    if (ready) return ready;
    ready = (async () => { const R = rc(); if (!R || /REPLACE_ME/.test(RC_KEYS[platform] || "")) return false;
      let appUserID; try { appUserID = localStorage.getItem("dp-install") || undefined; } catch (e) {}
      await R.configure({ apiKey: RC_KEYS[platform], appUserID }); return true; })();
    return ready;
  }
  window.DPStore = {
    async available() { return init(); },
    async products(ids) { const R = rc(); const r = await R.getProducts({ productIdentifiers: ids }); return (r.products || []).map(p => ({ id: p.identifier, price: p.priceString })); },
    async buy(id) { const R = rc(); try { const r = await R.getProducts({ productIdentifiers: [id] }); const prod = (r.products || [])[0]; if (!prod) return { ok: false };
        await R.purchaseStoreProduct({ product: prod }); return { ok: true }; } catch (e) { return { ok: false, cancelled: !!(e && e.userCancelled) }; } },
    async owned() { const R = rc(); const r = await R.getCustomerInfo(); const ci = r.customerInfo || r; return Object.keys((ci.entitlements && ci.entitlements.active) || {}).concat(ci.nonSubscriptionTransactions ? ci.nonSubscriptionTransactions.map(t => t.productIdentifier) : []); },
    async restore() { const R = rc(); await R.restorePurchases(); return this.owned(); }
  };
  /* haptics */
  if (P.Haptics) { navigator.vibrate = pat => { const arr = Array.isArray(pat) ? pat : [pat]; const on = arr.filter((_, i) => i % 2 === 0); const strongest = Math.max(...on, 0);
      P.Haptics.impact({ style: strongest >= 50 ? "HEAVY" : strongest >= 20 ? "MEDIUM" : "LIGHT" }).catch(() => {}); return true; }; }
  /* push */
  if (P.PushNotifications) { const PN = P.PushNotifications;
    PN.addListener("registration", t => { try { fetch(window.EAT_API + "/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installId: localStorage.getItem("dp-install"), token: t.value, platform }) }); } catch (e) {} });
    PN.addListener("pushNotificationActionPerformed", a => { const d = (a.notification && a.notification.data) || {}; if (d.join && window.EAT_JOIN) window.EAT_JOIN(d.join); });
    PN.checkPermissions().then(p => p.receive === "granted" ? PN.register() : PN.requestPermissions().then(r => r.receive === "granted" && PN.register())).catch(() => {}); }
  /* deep links */
  if (P.App) { P.App.addListener("appUrlOpen", e => { const m = /join\/([A-Z0-9-]{4,12})/i.exec(e.url || ""); if (m) { if (window.EAT_JOIN) window.EAT_JOIN(m[1].toUpperCase()); else window.EAT_PENDING_JOIN = m[1].toUpperCase(); } }); }
})();
