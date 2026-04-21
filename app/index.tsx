import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { WebView } from "react-native-webview";

export default function Index() {
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef(null);
  // Cached GPS position
  const lastPositionRef = useRef(null);

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
    <View style={{ flex: 1 }}>
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
        source={{ uri: "https://crm.salesportal.it" }}
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
