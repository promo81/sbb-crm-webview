import { router } from "expo-router";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { WebView } from "react-native-webview";
import { useWebViewStore } from "./store/webviewStore";

type TabName = "dashboard" | "clienti" | "mappa" | "agenda" | "checkin";

const PATH_TO_TAB: { prefix: string; tab: TabName }[] = [
  { prefix: "/agent/dashboard", tab: "dashboard" },
  { prefix: "/agent/clienti", tab: "clienti" },
  { prefix: "/agent/mappa", tab: "mappa" },
  { prefix: "/agent/agenda", tab: "agenda" },
  { prefix: "/agent/check-in", tab: "checkin" },
];

function resolveTabFromPath(pathname: string): TabName {
  for (const entry of PATH_TO_TAB) {
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix + "/")) {
      return entry.tab;
    }
  }
  return "dashboard";
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

export default function WebViewScreen() {
  const url = useWebViewStore((s) => s.url);
  const setUrl = useWebViewStore((s) => s.setUrl);
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef<WebView>(null);
  const lastPositionRef = useRef<Location.LocationObject | null>(null);
  const lastSyncedTabRef = useRef<TabName | null>(null);
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    webviewNavigator = (path: string) => {
      const currentPath = lastPathRef.current;
      if (currentPath === path) {
        return;
      }
      const storeUrl = useWebViewStore.getState().url;
      if (storeUrl === path) {
        const js = `window.location.assign(${JSON.stringify(
          "https://crm.salesportal.it" + path,
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
          'html, body, main {',
          '  width: 100% !important;',
          '  max-width: 100% !important;',
          '  margin: 0 !important;',
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
          '[class*="max-w-4xl"]:not([role="dialog"]):not([aria-modal="true"]):not([data-radix-popper-content-wrapper]) {',
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

        var MAP_STYLE_ID = '__rn_webview_map_style__';
        function applyMapFix() {
          if (!location.pathname || location.pathname.indexOf('/agent/mappa') === -1) {
            var existing = document.getElementById(MAP_STYLE_ID);
            if (existing) existing.parentNode.removeChild(existing);
            return;
          }
          if (document.getElementById(MAP_STYLE_ID)) return;

          var mapCss = [
            'html, body, main {',
            '  height: 100% !important;',
            '  min-height: 100% !important;',
            '}',
            '[class*="map"], [class*="Map"], [class*="leaflet"], [class*="mapbox"], [class*="gm-style"] {',
            '  display: block !important;',
            '  visibility: visible !important;',
            '  width: 100% !important;',
            '  max-width: 100% !important;',
            '  min-height: calc(100vh - 140px) !important;',
            '}'
          ].join('\\n');

          var mapEl = document.createElement('style');
          mapEl.id = MAP_STYLE_ID;
          mapEl.appendChild(document.createTextNode(mapCss));
          (document.head || document.documentElement).appendChild(mapEl);
        }
        applyMapFix();

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
          applyMapFix();
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
        source={{ uri: `https://crm.salesportal.it${url}` }}
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
        onLoadStart={() => {
          setLoading(true);
        }}
        onLoadEnd={() => {
          setLoading(false);
        }}
        onError={() => {
          setLoading(false);
          Alert.alert("Errore", "Connessione fallita");
        }}
        onHttpError={(e) => {
          setLoading(false);
          console.log("❌ HTTP", e.nativeEvent.statusCode);
        }}
        onNavigationStateChange={(nav) => {
          const pathname = safeParsePathname(nav.url);
          if (!pathname) return;
          if (!pathname.startsWith("/agent/")) return;
          if (pathname === lastPathRef.current) return;
          lastPathRef.current = pathname;

          const tab = resolveTabFromPath(pathname);

          if (lastSyncedTabRef.current !== tab) {
            lastSyncedTabRef.current = tab;
            try {
              router.replace(`/${tab}` as never);
            } catch {
              // ignore navigation errors
            }
          }
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
