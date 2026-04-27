import { router } from "expo-router";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  getNotificationUrl,
  registerForPushNotificationsAsync,
  setupAndroidNotificationChannel,
} from "../lib/pushNotifications";
import { useWebViewStore } from "../store/webviewStore";

const BASE_URL = "https://app.salesportal.it";

function buildWebUrl(path: string) {
  const safePath = path || "/agent/dashboard";
  const separator = safePath.includes("?") ? "&" : "?";
  const finalUrl = `${BASE_URL}${safePath}${separator}native=1&appv=mapfix1`;
  if (__DEV__) {
    console.log("BUILD URL", { path, finalUrl });
  }
  return finalUrl;
}

type TabName = "dashboard" | "clienti" | "mappa" | "agenda" | "checkin";

const PATH_TO_TAB: { prefix: string; tab: TabName }[] = [
  { prefix: "/agent/dashboard", tab: "dashboard" },
  { prefix: "/agent/clienti", tab: "clienti" },
  { prefix: "/agent/mappa", tab: "mappa" },
  { prefix: "/agent/agenda", tab: "agenda" },
  { prefix: "/agent/check-in", tab: "checkin" },
];

type NavType =
  | { kind: "tab"; tab: TabName }
  | { kind: "extra" };

function resolveNavType(pathname: string): NavType {
  for (const entry of PATH_TO_TAB) {
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix + "/")) {
      return { kind: "tab", tab: entry.tab };
    }
  }
  return { kind: "extra" };
}

function safeParsePathname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    const match = rawUrl.match(/^https?:\/\/[^/]+(\/[^?#]*)/);
    return match ? match[1] : null;
  }
}

let webviewNavigator: ((path: string) => void) | null = null;

export function navigateWebView(path: string): void {
  if (webviewNavigator) webviewNavigator(path);
}

const TAB_PATHS = new Set(PATH_TO_TAB.map((e) => e.prefix));

let currentWebViewPath: string | null = null;

export function getCurrentWebViewPath(): string | null {
  return currentWebViewPath;
}

export function isOnExtraRoute(): boolean {
  const p = currentWebViewPath;
  if (!p) return false;
  if (!p.startsWith("/agent/")) return false;
  for (const tabPath of TAB_PATHS) {
    if (p === tabPath || p.startsWith(tabPath + "/")) return false;
  }
  return true;
}

let programmaticTabChange = false;

export function isProgrammaticTabChange(): boolean {
  return programmaticTabChange;
}

export default function WebViewScreen() {
  const url = useWebViewStore((s) => s.url);
  const setUrl = useWebViewStore((s) => s.setUrl);
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef<WebView>(null);
  const lastPositionRef = useRef<Location.LocationObject | null>(null);
  const lastSyncedTabRef = useRef<TabName | null>(null);
  const lastPathRef = useRef<string | null>(null);
  const expoPushTokenRef = useRef<string | null>(null);
  const loaderSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Loader visibile solo per navigazioni avviate dall'utente via tabPress
  // nativo (o al primo mount). Gli eventi di navigazione interna SPA
  // (link cliccati nella WebView, route extra) non mostrano l'overlay.
  const loaderRequestedRef = useRef<boolean>(true);

  const clearLoaderSafetyTimer = () => {
    if (loaderSafetyTimerRef.current) {
      clearTimeout(loaderSafetyTimerRef.current);
      loaderSafetyTimerRef.current = null;
    }
  };

  const armLoaderSafetyTimer = () => {
    clearLoaderSafetyTimer();
    loaderSafetyTimerRef.current = setTimeout(() => {
      setLoading(false);
      loaderRequestedRef.current = false;
      loaderSafetyTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      clearLoaderSafetyTimer();
    };
  }, []);

  useEffect(() => {
    webviewNavigator = (path: string) => {
      const currentPath = lastPathRef.current;
      if (currentPath === path) {
        return;
      }
      // Navigazione richiesta esplicitamente dall'app (tabPress nativo) →
      // ammettiamo l'overlay loading per il prossimo onLoadStart.
      loaderRequestedRef.current = true;
      const storeUrl = useWebViewStore.getState().url;
      if (storeUrl === path) {
        const js = `window.location.assign(${JSON.stringify(
          buildWebUrl(path),
        )}); true;`;
        webviewRef.current?.injectJavaScript(js);
      } else {
        setUrl(path);
      }
    };
    return () => {
      webviewNavigator = null;
    };
  }, [setUrl]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          lastPositionRef.current = pos;
          console.log("⚡ Prefetched GPS");
        }
      } catch {
        console.log("❌ Prefetch GPS failed");
      }
    })();
  }, []);

  // CRM web should listen to window expoPushToken event and save token
  // with authenticated session. The native app does NOT persist the token
  // to Supabase directly: it only forwards it to the WebView.
  const injectPushTokenToWebView = (token: string) => {
    const safeToken = JSON.stringify(token);
    const safePlatform = JSON.stringify(Platform.OS);
    const js = `
      (function() {
        try {
          window.__EXPO_PUSH_TOKEN__ = ${safeToken};
          window.dispatchEvent(new CustomEvent("expoPushToken", {
            detail: { token: ${safeToken}, platform: ${safePlatform} }
          }));
        } catch (_) {}
      })();
      true;
    `;
    webviewRef.current?.injectJavaScript(js);
  };

  useEffect(() => {
    let isMounted = true;

    (async () => {
      await setupAndroidNotificationChannel();
      const token = await registerForPushNotificationsAsync();
      if (!isMounted) return;
      if (token) {
        expoPushTokenRef.current = token;
        // Try immediate injection; onLoadEnd will reinject anyway.
        injectPushTokenToWebView(token);
      }
    })();

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const targetUrl = getNotificationUrl(response);
        if (targetUrl) {
          useWebViewStore.getState().setUrl(targetUrl);
        }
      },
    );

    (async () => {
      try {
        const lastResponse =
          await Notifications.getLastNotificationResponseAsync();
        if (!isMounted) return;
        const targetUrl = getNotificationUrl(lastResponse);
        if (targetUrl) {
          useWebViewStore.getState().setUrl(targetUrl);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      isMounted = false;
      responseSub.remove();
    };
  }, []);

  const INJECTED_JS = `
    (function() {
      try {
        var STYLE_ID = '__rn_webview_fix_style__';
        if (document.getElementById(STYLE_ID)) return;

        var css = [
          'html, body, main, #__next, [data-nextjs-scroll-focus-boundary] {',
          '  width: 100% !important;',
          '  max-width: 100% !important;',
          '  margin-left: 0 !important;',
          '  margin-right: 0 !important;',
          '  padding-left: 0 !important;',
          '  padding-right: 0 !important;',
          '  overflow-x: hidden !important;',
          '  box-sizing: border-box !important;',
          '}',
          'body {',
          '  padding-top: 40px !important;',
          '  padding-bottom: 16px !important;',
          '  background-color: #ffffff !important;',
          '}',
          '[class*="container"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="mx-auto"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-sm"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-md"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-lg"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-xl"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-2xl"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-3xl"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-4xl"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-5xl"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]),',
          '[class*="max-w-6xl"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]) {',
          '  width: 100% !important;',
          '  max-width: 100% !important;',
          '  margin-left: 0 !important;',
          '  margin-right: 0 !important;',
          '  box-sizing: border-box !important;',
          '}',
          '.bottom-nav, .mobile-nav, [class*="BottomNav"], [class*="MobileNav"] {',
          '  display: none !important;',
          '}'
        ].join('\\n');

        var styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.appendChild(document.createTextNode(css));
        (document.head || document.documentElement).appendChild(styleEl);

        var BOTTOM_LABELS = ['Dashboard', 'Clienti', 'Mappa', 'Agenda', 'Check-in'];
        var SIDEBAR_CLASS_HINTS = ['sidebar', 'Sidebar', 'side-nav', 'SideNav', 'drawer', 'Drawer', 'side-menu', 'SideMenu'];

        function isInsideSidebarContext(el) {
          var cur = el;
          while (cur && cur !== document.body) {
            if (cur.tagName === 'ASIDE') return true;
            if (cur.getAttribute) {
              var role = cur.getAttribute('role');
              if (role === 'navigation' || role === 'complementary' || role === 'menu') return true;
              if (cur.hasAttribute('data-sidebar')) return true;
              if (cur.hasAttribute('data-drawer')) return true;
            }
            var cls = (cur.className && typeof cur.className === 'string') ? cur.className : '';
            for (var k = 0; k < SIDEBAR_CLASS_HINTS.length; k++) {
              if (cls.indexOf(SIDEBAR_CLASS_HINTS[k]) !== -1) return true;
            }
            cur = cur.parentElement;
          }
          return false;
        }

        function containsSidebar(el) {
          if (!el || !el.querySelector) return false;
          if (el.querySelector('aside')) return true;
          if (el.querySelector('[role="navigation"]')) return true;
          if (el.querySelector('[data-sidebar]')) return true;
          return false;
        }

        function hideDuplicateBottomMenu() {
          var all = document.body ? document.body.querySelectorAll('*') : [];
          var vw = window.innerWidth;
          var vh = window.innerHeight;
          for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (el.tagName === 'NAV') continue;
            if (el.tagName === 'ASIDE') continue;
            if (el.getAttribute) {
              var role = el.getAttribute('role');
              if (role === 'navigation' || role === 'complementary' || role === 'menu') continue;
              if (el.hasAttribute('data-sidebar')) continue;
              if (el.hasAttribute('data-drawer')) continue;
            }
            var cls = (el.className && typeof el.className === 'string') ? el.className : '';
            var isSidebarLike = false;
            for (var s = 0; s < SIDEBAR_CLASS_HINTS.length; s++) {
              if (cls.indexOf(SIDEBAR_CLASS_HINTS[s]) !== -1) { isSidebarLike = true; break; }
            }
            if (isSidebarLike) continue;

            if (isInsideSidebarContext(el)) continue;
            if (containsSidebar(el)) continue;

            var cs = window.getComputedStyle(el);
            var pos = cs.position;
            if (pos !== 'fixed' && pos !== 'sticky') continue;

            var rect = el.getBoundingClientRect();
            if (rect.bottom < vh - 80) continue;
            if (rect.top < vh * 0.55) continue;
            if (rect.height === 0 || rect.width === 0) continue;
            if (rect.height > 140) continue;
            if (rect.width < vw * 0.6) continue;

            var txt = (el.innerText || '').trim();
            if (!txt) continue;
            var hits = 0;
            for (var j = 0; j < BOTTOM_LABELS.length; j++) {
              if (txt.indexOf(BOTTOM_LABELS[j]) !== -1) hits++;
            }
            if (hits >= 3) {
              el.style.setProperty('display', 'none', 'important');
            }
          }
        }

        function runDomFixes() {
          hideDuplicateBottomMenu();
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', runDomFixes);
        } else {
          runDomFixes();
        }
        setTimeout(runDomFixes, 400);
        setTimeout(runDomFixes, 1200);

        var lastPath = location.pathname;
        setInterval(function() {
          if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            runDomFixes();
          }
        }, 600);

        window.__gpsSuccess = null;
        window.__gpsError = null;
        navigator.geolocation.getCurrentPosition = function(success, error) {
          window.__gpsSuccess = success;
          window.__gpsError = error;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'request_gps' }));
          }
        };

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'log',
            data: 'Injected JS ready: ' + location.pathname
          }));
        }

        // ===== EXTERNAL URL INTERCEPTOR =====
        // Necessario perché:
        //  - setSupportMultipleWindows={false} fa sì che window.open() non
        //    sempre triggeri onShouldStartLoadWithRequest.
        //  - I link target="_blank" possono aprirsi nella stessa WebView.
        //  - Vogliamo che Google Maps / geo:/intent:// vadano fuori app.
        function isExternalMapUrl(u) {
          if (!u || typeof u !== 'string') return false;
          if (u.indexOf('intent://') === 0) return true;
          if (u.indexOf('comgooglemaps://') === 0) return true;
          if (u.indexOf('geo:') === 0) return true;
          if (u.indexOf('google.navigation:') === 0) return true;
          if (u.indexOf('maps:') === 0) return true;
          if (u.indexOf('tel:') === 0) return true;
          if (u.indexOf('mailto:') === 0) return true;
          if (u.indexOf('sms:') === 0) return true;
          if (u.indexOf('whatsapp:') === 0) return true;
          if (/^https?:\\/\\/(www\\.)?google\\.[a-z.]+\\/maps/i.test(u)) return true;
          if (/^https?:\\/\\/maps\\.google\\.[a-z.]+/i.test(u)) return true;
          if (/^https?:\\/\\/maps\\.app\\.goo\\.gl\\//i.test(u)) return true;
          if (/^https?:\\/\\/goo\\.gl\\/maps/i.test(u)) return true;
          return false;
        }

        function postOpenExternal(u) {
          try {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'open_external_url',
                url: u
              }));
            }
          } catch (_) {}
        }

        // 1) Sovrascrivi window.open: se URL esterno → manda a RN, blocca apertura.
        if (!window.__rn_window_open_hooked__) {
          window.__rn_window_open_hooked__ = true;
          var origOpen = window.open;
          window.open = function(u, target, features) {
            try {
              if (isExternalMapUrl(u)) {
                postOpenExternal(u);
                return null;
              }
            } catch (_) {}
            try {
              return origOpen ? origOpen.apply(window, arguments) : null;
            } catch (_) {
              // Alcune WebView lanciano se origOpen è null
              return null;
            }
          };
        }

        // 2) Intercetta click su anchor verso URL esterni.
        if (!window.__rn_anchor_click_hooked__) {
          window.__rn_anchor_click_hooked__ = true;
          document.addEventListener('click', function(ev) {
            try {
              var el = ev.target;
              while (el && el !== document.body) {
                if (el.tagName === 'A') break;
                el = el.parentElement;
              }
              if (!el || el.tagName !== 'A') return;
              var href = el.getAttribute('href') || '';
              if (!href) return;
              if (isExternalMapUrl(href)) {
                ev.preventDefault();
                ev.stopPropagation();
                postOpenExternal(href);
              }
            } catch (_) {}
          }, true);
        }
        // ===== /EXTERNAL URL INTERCEPTOR =====

        function safePost(payload) {
          try {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(payload));
            }
          } catch (_) {}
        }

        function reportPageInfo(label) {
          try {
            var body = document.body;
            var html = document.documentElement;
            var rect = body ? body.getBoundingClientRect() : null;
            safePost({
              type: 'log',
              data: {
                tag: 'PAGE_INFO',
                label: label,
                href: location.href,
                pathname: location.pathname,
                title: document.title,
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                docClientWidth: html ? html.clientWidth : null,
                bodyClientWidth: body ? body.clientWidth : null,
                bodyScrollWidth: body ? body.scrollWidth : null,
                bodyRect: rect ? {
                  x: rect.x, y: rect.y,
                  width: rect.width, height: rect.height,
                  top: rect.top, left: rect.left,
                  right: rect.right, bottom: rect.bottom
                } : null
              }
            });
          } catch (_) {}
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function() { reportPageInfo('DOMContentLoaded'); });
        } else {
          reportPageInfo('initial');
        }
        setTimeout(function() { reportPageInfo('after_500ms'); }, 500);
        setTimeout(function() { reportPageInfo('after_1500ms'); }, 1500);

        var EXTRA_PATHS = ['/agent/compiti', '/agent/report', '/agent/trattative'];
        function isExtraPath() {
          for (var ei = 0; ei < EXTRA_PATHS.length; ei++) {
            if (location.pathname === EXTRA_PATHS[ei] ||
                location.pathname.indexOf(EXTRA_PATHS[ei] + '/') === 0) {
              return true;
            }
          }
          return false;
        }
        if (isExtraPath()) {
          safePost({ type: 'log', data: { tag: 'EXTRA_ROUTE_WEB', pathname: location.pathname } });
        }

        if (!window.__rn_fetch_hooked__) {
          window.__rn_fetch_hooked__ = true;
          var origFetch = window.fetch;
          if (typeof origFetch === 'function') {
            window.fetch = function() {
              var args = arguments;
              var input = args[0];
              var reqUrl = '';
              try {
                reqUrl = (typeof input === 'string') ? input : (input && input.url) || '';
              } catch (_) { reqUrl = ''; }
              var startedAt = Date.now();
              return origFetch.apply(this, args).then(function(resp) {
                try {
                  safePost({
                    type: 'log',
                    data: {
                      tag: 'FETCH',
                      url: reqUrl,
                      status: resp && resp.status,
                      ok: resp && resp.ok,
                      ms: Date.now() - startedAt
                    }
                  });
                } catch (_) {}
                return resp;
              }, function(err) {
                try {
                  safePost({
                    type: 'log',
                    data: {
                      tag: 'FETCH_ERROR',
                      url: reqUrl,
                      message: (err && err.message) ? String(err.message) : 'unknown',
                      ms: Date.now() - startedAt
                    }
                  });
                } catch (_) {}
                throw err;
              });
            };
          }

          var OrigXHR = window.XMLHttpRequest;
          if (typeof OrigXHR === 'function') {
            var origOpen = OrigXHR.prototype.open;
            var origSend = OrigXHR.prototype.send;
            OrigXHR.prototype.open = function(method, url) {
              try {
                this.__rn_method = method;
                this.__rn_url = url;
              } catch (_) {}
              return origOpen.apply(this, arguments);
            };
            OrigXHR.prototype.send = function() {
              var self = this;
              var startedAt = Date.now();
              try {
                self.addEventListener('loadend', function() {
                  try {
                    safePost({
                      type: 'log',
                      data: {
                        tag: 'XHR',
                        method: self.__rn_method,
                        url: self.__rn_url,
                        status: self.status,
                        ms: Date.now() - startedAt
                      }
                    });
                  } catch (_) {}
                });
              } catch (_) {}
              return origSend.apply(this, arguments);
            };
          }
        }
      } catch (e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'log',
            data: 'Injected JS error'
          }));
        }
      }
    })();
    true;
  `;

  const getIntentFallbackUrl = (url: string): string | null => {
    try {
      if (!url.startsWith("intent://")) return null;
      const match = url.match(/S\.browser_fallback_url=([^;]+)/);
      if (!match || !match[1]) return null;
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  };

  // Trasforma un intent:// Android in una URL apribile direttamente.
  // Se non riusciamo a estrarre nulla di utile, ritorniamo null.
  const normalizeIntentUrl = (url: string): string | null => {
    if (!url.startsWith("intent://")) return null;
    const fallback = getIntentFallbackUrl(url);
    if (fallback) return fallback;
    // intent://maps/...#Intent;...;end → prova a riscriverlo come https://maps...
    try {
      const stripped = url.replace(/^intent:\/\//, "");
      const beforeHash = stripped.split("#")[0];
      if (beforeHash.startsWith("maps") || beforeHash.includes("google.com/maps")) {
        return `https://www.google.com/${beforeHash}`;
      }
    } catch {
      // ignore
    }
    return null;
  };

  // Apre URL esterni. Per https NON usiamo canOpenURL (su Android 11+ può
  // dare false positive di "non apribile" senza <queries> nel manifest):
  // proviamo direttamente openURL e gestiamo l'errore.
  const openExternalUrl = async (rawUrl: string): Promise<void> => {
    if (__DEV__) {
      console.log("OPEN EXTERNAL", rawUrl);
    }

    // 1) intent:// → prova prima a riscrivere a https/scheme nativo
    if (rawUrl.startsWith("intent://")) {
      const normalized = normalizeIntentUrl(rawUrl);
      if (normalized) {
        try {
          await Linking.openURL(normalized);
          return;
        } catch {
          // continuiamo coi fallback
        }
      }
      // Su Android possiamo provare ad aprire l'intent:// raw (alcune
      // versioni di Android lo gestiscono, altre no).
      if (Platform.OS === "android") {
        try {
          await Linking.openURL(rawUrl);
          return;
        } catch {
          // fallthrough
        }
      }
    }

    // 2) comgooglemaps:// → se non installato, fallback https
    if (rawUrl.startsWith("comgooglemaps://")) {
      try {
        await Linking.openURL(rawUrl);
        return;
      } catch {
        const fallback = rawUrl.replace(
          "comgooglemaps://",
          "https://www.google.com/maps/",
        );
        try {
          await Linking.openURL(fallback);
          return;
        } catch {
          Alert.alert("Impossibile aprire Google Maps");
          return;
        }
      }
    }

    // 3) geo: / google.navigation: → openURL diretto con fallback https
    if (
      rawUrl.startsWith("geo:") ||
      rawUrl.startsWith("google.navigation:") ||
      rawUrl.startsWith("maps:")
    ) {
      try {
        await Linking.openURL(rawUrl);
        return;
      } catch {
        const httpsFallback = buildHttpsFallback(rawUrl);
        if (httpsFallback) {
          try {
            await Linking.openURL(httpsFallback);
            return;
          } catch {
            // ignore
          }
        }
        Alert.alert("Impossibile aprire Google Maps");
        return;
      }
    }

    // 4) https://(www.)?google.com/maps... e maps.google.com / maps.app.goo.gl
    // Su Android il sistema mostra il chooser (Google Maps / Browser). Su iOS
    // apre Maps se installato, altrimenti Safari. openURL https dovrebbe
    // sempre funzionare → niente canOpenURL gate.
    try {
      await Linking.openURL(rawUrl);
      return;
    } catch (err) {
      if (__DEV__) {
        console.log("OPEN EXTERNAL FAILED", err);
      }
      Alert.alert(
        "Impossibile aprire Google Maps",
        "Verifica di avere installato Google Maps o un browser.",
      );
    }
  };

  // Da geo:/google.navigation: produce un URL https equivalente come fallback.
  const buildHttpsFallback = (url: string): string | null => {
    try {
      // geo:LAT,LNG?q=LAT,LNG(label) | geo:0,0?q=LAT,LNG | geo:0,0?q=address
      if (url.startsWith("geo:")) {
        const after = url.slice(4);
        const [coords, query] = after.split("?");
        const qMatch = query?.match(/q=([^&]+)/);
        if (qMatch && qMatch[1]) {
          return `https://www.google.com/maps/search/?api=1&query=${qMatch[1]}`;
        }
        if (coords && coords !== "0,0") {
          return `https://www.google.com/maps?q=${coords}`;
        }
      }
      // google.navigation:q=LAT,LNG
      if (url.startsWith("google.navigation:")) {
        const qMatch = url.match(/q=([^&]+)/);
        if (qMatch && qMatch[1]) {
          return `https://www.google.com/maps/dir/?api=1&destination=${qMatch[1]}`;
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const shouldOpenExternally = (url: string): boolean => {
    if (!url) return false;
    // Schemi non-http → sempre esterni
    if (url.startsWith("intent://")) return true;
    if (url.startsWith("comgooglemaps://")) return true;
    if (url.startsWith("geo:")) return true;
    if (url.startsWith("google.navigation:")) return true;
    if (url.startsWith("maps:")) return true;
    if (url.startsWith("tel:")) return true;
    if (url.startsWith("mailto:")) return true;
    if (url.startsWith("sms:")) return true;
    if (url.startsWith("whatsapp:")) return true;
    // HTTPS Maps (ogni variante)
    if (/^https?:\/\/(www\.)?google\.[a-z.]+\/maps/i.test(url)) return true;
    if (/^https?:\/\/maps\.google\.[a-z.]+/i.test(url)) return true;
    if (/^https?:\/\/maps\.app\.goo\.gl\//i.test(url)) return true;
    if (/^https?:\/\/goo\.gl\/maps/i.test(url)) return true;
    return false;
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", paddingTop: 40 }}>
      {loading && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10,
            backgroundColor: "#fff",
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      )}

      <WebView
        ref={webviewRef}
        source={{ uri: buildWebUrl(url) }}
        javaScriptEnabled
        domStorageEnabled={true}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        androidLayerType="hardware"
        incognito={false}
        originWhitelist={["*"]}
        setSupportMultipleWindows={true}
        onOpenWindow={(syntheticEvent) => {
          try {
            const targetUrl = syntheticEvent?.nativeEvent?.targetUrl;
            if (__DEV__) {
              console.log("OPEN WINDOW", targetUrl);
            }
            if (targetUrl) {
              if (shouldOpenExternally(targetUrl)) {
                openExternalUrl(targetUrl);
              } else {
                webviewRef.current?.injectJavaScript(
                  `window.location.assign(${JSON.stringify(targetUrl)}); true;`,
                );
              }
            }
          } catch (e) {
            if (__DEV__) {
              console.log("OPEN WINDOW ERROR", e);
            }
          }
        }}
        userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 9) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
        geolocationEnabled={true}
        {...({
          onGeolocationPermissionsShowPrompt: (
            _origin: string,
            callback: (allow: boolean) => void,
          ) => {
            console.log("📍 GPS permission request");
            callback(true);
          },
        } as object)}
        mixedContentMode="always"
        javaScriptCanOpenWindowsAutomatically={true}
        onLoadStart={(e) => {
          if (loaderRequestedRef.current) {
            setLoading(true);
            armLoaderSafetyTimer();
          }
          if (__DEV__) {
            console.log(
              "LOAD START",
              e?.nativeEvent?.url,
              "showLoader",
              loaderRequestedRef.current,
            );
          }
        }}
        onLoadEnd={(e) => {
          setLoading(false);
          loaderRequestedRef.current = false;
          clearLoaderSafetyTimer();
          if (__DEV__) {
            console.log("LOAD END", e?.nativeEvent?.url);
          }
          // Reinject push token after each load: SPA route changes / full
          // page navigations may drop listeners registered by the previous
          // page instance.
          const tk = expoPushTokenRef.current;
          if (tk) {
            injectPushTokenToWebView(tk);
          }
        }}
        onError={(e) => {
          setLoading(false);
          loaderRequestedRef.current = false;
          clearLoaderSafetyTimer();
          if (__DEV__) {
            console.log("WEBVIEW ERROR", e.nativeEvent);
          }
          Alert.alert("Errore", "Connessione fallita");
        }}
        onHttpError={(e) => {
          setLoading(false);
          loaderRequestedRef.current = false;
          clearLoaderSafetyTimer();
          if (__DEV__) {
            console.log(
              "HTTP ERROR",
              e.nativeEvent.statusCode,
              e.nativeEvent.url,
            );
          } else {
            console.log("❌ HTTP", e.nativeEvent.statusCode);
          }
        }}
        onShouldStartLoadWithRequest={(req) => {
          const reqUrl = req.url || "";
          if (__DEV__) {
            console.log("REQ", {
              url: reqUrl,
              mainDocumentURL: (req as { mainDocumentURL?: string })
                .mainDocumentURL,
              navigationType: req.navigationType,
              isTopFrame: (req as { isTopFrame?: boolean }).isTopFrame,
            });
          }

          // Sub-frame (iframe Leaflet/tile/embed): non intercettare.
          const isTopFrame =
            (req as { isTopFrame?: boolean }).isTopFrame !== false;
          if (!isTopFrame) {
            return true;
          }

          if (shouldOpenExternally(reqUrl)) {
            if (__DEV__) {
              console.log("EXTERNAL → openURL", reqUrl);
            }
            openExternalUrl(reqUrl);
            return false;
          }
          return true;
        }}
        onNavigationStateChange={(nav) => {
          const pathname = safeParsePathname(nav.url);
          if (!pathname) return;
          if (!pathname.startsWith("/agent/")) return;
          if (pathname === lastPathRef.current) return;
          lastPathRef.current = pathname;
          currentWebViewPath = pathname;

          const navType = resolveNavType(pathname);

          if (__DEV__) {
            console.log("NAV STATE", {
              url: nav.url,
              pathname,
              title: nav.title,
              loading: nav.loading,
              canGoBack: nav.canGoBack,
              navType,
            });
            if (
              pathname === "/agent/compiti" ||
              pathname === "/agent/report" ||
              pathname === "/agent/trattative"
            ) {
              console.log(
                "EXTRA ROUTE DETECTED - should NOT redirect",
                pathname,
              );
            }
          }

          if (navType.kind !== "tab") {
            // Route extra: NON sincronizziamo la tab nativa per evitare
            // che eventuali tabPress (utente o programmatici) sovrascrivano
            // la WebView via setUrl. Niente setUrl, niente router.replace,
            // niente forzature verso dashboard.
            // Le navigazioni interne SPA verso route extra non devono
            // mostrare l'overlay loader: se era attivo per inerzia, lo
            // spegniamo qui.
            loaderRequestedRef.current = false;
            setLoading(false);
            clearLoaderSafetyTimer();
            return;
          }

          const tab = navType.tab;
          if (lastSyncedTabRef.current === tab) return;
          lastSyncedTabRef.current = tab;

          if (__DEV__) {
            console.log("SYNC TAB", tab);
          }

          programmaticTabChange = true;
          try {
            router.replace(`/${tab}` as never);
          } catch {
            // ignore navigation errors
          }
          // Sblocca il flag dopo che il tabPress sintetico (se emesso da
          // react-navigation in conseguenza del replace) è già passato.
          setTimeout(() => {
            programmaticTabChange = false;
          }, 50);
        }}
        injectedJavaScript={INJECTED_JS}
        onMessage={async (event) => {
          let msg: { type?: string; data?: unknown } | null = null;
          try {
            msg = JSON.parse(event.nativeEvent.data);
          } catch {
            return;
          }
          if (!msg || typeof msg !== "object") return;

          if (msg.type === "log") {
            console.log("📲", msg.data);
            return;
          }

          if (msg.type === "open_external_url") {
            const externalUrl =
              typeof (msg as { url?: unknown }).url === "string"
                ? ((msg as { url: string }).url)
                : "";
            if (externalUrl) {
              await openExternalUrl(externalUrl);
            }
            return;
          }

          if (msg.type === "request_gps") {
            try {
              const { status } =
                await Location.requestForegroundPermissionsAsync();
              if (status !== "granted") {
                console.log("❌ GPS permission denied");
                return;
              }

              let pos = lastPositionRef.current;
              if (!pos) {
                pos = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Balanced,
                });
                lastPositionRef.current = pos;
              }

              const js = `
                if (window.__gpsSuccess) {
                  window.__gpsSuccess({
                    coords: {
                      latitude: ${pos.coords.latitude},
                      longitude: ${pos.coords.longitude},
                      accuracy: ${pos.coords.accuracy}
                    }
                  });
                }
                true;
              `;

              webviewRef?.current?.injectJavaScript(js);
            } catch {
              console.log("❌ GPS error");
            }
          }
        }}
      />
    </View>
  );
}
