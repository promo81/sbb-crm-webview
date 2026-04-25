import { router } from "expo-router";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, View } from "react-native";
import { WebView } from "react-native-webview";
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

  const openExternalUrl = async (url: string): Promise<void> => {
    const fallbackUrl = url.startsWith("intent://")
      ? getIntentFallbackUrl(url)
      : null;
    const targetUrl = fallbackUrl || url;
    try {
      const canOpen = await Linking.canOpenURL(targetUrl);
      if (canOpen) {
        await Linking.openURL(targetUrl);
        return;
      }
      if (fallbackUrl) {
        await Linking.openURL(fallbackUrl);
        return;
      }
      Alert.alert("Impossibile aprire Google Maps");
    } catch {
      if (fallbackUrl) {
        try {
          await Linking.openURL(fallbackUrl);
          return;
        } catch {
          if (__DEV__) {
            console.log("EXTERNAL OPEN FAILED");
          }
        }
      }
      if (__DEV__) {
        console.log("EXTERNAL OPEN FAILED");
      }
      Alert.alert("Impossibile aprire Google Maps");
    }
  };

  const shouldOpenExternally = (url: string): boolean => {
    if (!url) return false;
    if (url.startsWith("intent://")) return true;
    if (url.startsWith("comgooglemaps://")) return true;
    if (url.startsWith("https://www.google.com/maps/dir")) return true;
    if (url.startsWith("https://maps.google.com/maps/dir")) return true;
    if (url.startsWith("https://www.google.com/maps")) return true;
    if (url.startsWith("https://maps.google.com/maps")) return true;
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
        setSupportMultipleWindows={false}
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
          if (__DEV__) {
            console.log("REQ", {
              url: req.url,
              mainDocumentURL: (req as { mainDocumentURL?: string })
                .mainDocumentURL,
              navigationType: req.navigationType,
              isTopFrame: (req as { isTopFrame?: boolean }).isTopFrame,
            });
          }
          if (shouldOpenExternally(req.url)) {
            openExternalUrl(req.url);
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
