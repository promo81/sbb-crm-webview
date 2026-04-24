import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { WebView } from "react-native-webview";
import { useWebViewStore } from "./store/webviewStore";

export default function WebViewScreen() {
  const url = useWebViewStore((s) => s.url);
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef<WebView>(null);
  // Cached GPS position
  const lastPositionRef = useRef<Location.LocationObject | null>(null);

  // Pre-fetch GPS position on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          lastPositionRef.current = pos;
          console.log("⚡ Prefetched GPS", pos.coords);
        }
      } catch (e) {
        console.log("❌ Prefetch GPS failed", e);
      }
    })();
  }, []);

  const INJECTED_JS = `
    (function() {
      console.log('🔥 INJECTED START');

      // UI FIX BASE
      document.body.style.paddingLeft = '0px';
      document.body.style.paddingRight = '0px';
      document.body.style.paddingBottom = '16px';
      document.body.style.paddingTop = '40px';
      document.body.style.boxSizing = 'border-box';
      document.body.style.backgroundColor = '#ffffff';

      // FORCE FULL WIDTH (override common Tailwind containers)
      const containers = document.querySelectorAll('[class*="container"], .mx-auto, main');
      containers.forEach(el => {
        el.style.maxWidth = '100vw';
        el.style.width = '100vw';
        el.style.marginLeft = '0';
        el.style.marginRight = '0';
        el.style.paddingLeft = '0px';
        el.style.paddingRight = '0px';
      });

      // HIDE ALL WEB NAV (bottom + tabs + navbar)
      setTimeout(() => {
        document.querySelectorAll(
          'nav, footer, [class*="bottom"], [class*="footer"], [class*="tab"], [role="navigation"]'
        ).forEach(el => {
          el.style.display = 'none';
        });

        // ensure main content is visible full width
        document.body.style.margin = '0';
        document.body.style.paddingBottom = '16px';
      }, 300);

      // Improve card spacing
      setTimeout(() => {
        const cards = document.querySelectorAll('div');
        cards.forEach(c => {
          const text = c.innerText || '';
          if (
            text.includes('Check-in') ||
            text.includes('€') ||
            text.includes('Appuntamenti') ||
            text.includes('Pipeline')
          ) {
            c.style.marginBottom = '16px';
            c.style.borderRadius = '16px';
            c.style.padding = '16px';
          }
        });
      }, 500);

      // Log cookies and localStorage
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cookies', data: document.cookie }));
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'localStorage', data: JSON.stringify(localStorage) }));

      // Forward console logs to React Native
      const log = console.log;
      console.log = function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', data: Array.from(arguments) }));
        log.apply(console, arguments);
      };

      // Hook fetch
      const oldFetch = window.fetch;
      window.fetch = function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fetch', url: arguments[0] }));
        return oldFetch.apply(this, arguments);
      };

      // Hook XHR
      const oldOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'xhr', url }));
        return oldOpen.apply(this, arguments);
      };

      // GPS debug
      window.__gpsSuccess = null;
      window.__gpsError = null;

      navigator.geolocation.getCurrentPosition = function(success, error) {
        window.__gpsSuccess = success;
        window.__gpsError = error;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'request_gps' }));
      };
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
        // 🔐 LOGIN / COOKIE FIX
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
        // 🔥 USER AGENT → evita logout
        userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 9) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
        // 📍 GPS
        geolocationEnabled={true}
        onGeolocationPermissionsShowPrompt={(origin, callback) => {
          console.log("📍 GPS PERMISSION REQUEST:", origin);
          callback(true);
        }}
        // Additional props for debugging cookies/session
        mixedContentMode="always"
        javaScriptCanOpenWindowsAutomatically={true}
        // Error handling
        onError={() => Alert.alert("Errore", "Connessione fallita")}
        onHttpError={(e) => {
          console.log("❌ HTTP ERROR:", e.nativeEvent);
          Alert.alert(
            "Errore HTTP",
            `${e.nativeEvent.statusCode} - ${e.nativeEvent.url}`,
          );
        }}
        // Debug utile
        onLoad={() => console.log("✅ WebView loaded")}
        onLoadEnd={() => {
          console.log("📄 Load End");
          setLoading(false);
        }}
        onNavigationStateChange={(nav) => console.log("URL:", nav.url)}
        onShouldStartLoadWithRequest={(req) => {
          console.log("REQ:", req.url);
          return true;
        }}
        injectedJavaScript={INJECTED_JS}
        onMessage={async (event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);

            console.log("📲 WEBVIEW:", msg);

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
                `;

                webviewRef?.current?.injectJavaScript(js);
              } catch (err) {
                console.log("❌ GPS ERROR", err);
              }
            }
          } catch (e) {
            console.log("📲 RAW:", event.nativeEvent.data);
          }
        }}
      />
    </View>
  );
}
