import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import WebViewScreen from "../WebViewScreen";

const TAB_BAR_HEIGHT = 70;

export default function Layout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: "#007AFF",
          tabBarInactiveTintColor: "#999",
          tabBarStyle: {
            height: TAB_BAR_HEIGHT,
            paddingBottom: 10,
          },
          tabBarIcon: ({ color, size }) => {
            let iconName = "home";

            if (route.name === "dashboard") iconName = "home";
            if (route.name === "clienti") iconName = "people";
            if (route.name === "mappa") iconName = "map";
            if (route.name === "agenda") iconName = "calendar";
            if (route.name === "checkin") iconName = "checkmark-circle";

            return <Ionicons name={iconName as any} size={size} color={color} />;
          },
        })}
      >
        <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
        <Tabs.Screen name="clienti" options={{ title: "Clienti" }} />
        <Tabs.Screen name="mappa" options={{ title: "Mappa" }} />
        <Tabs.Screen name="agenda" options={{ title: "Agenda" }} />
        <Tabs.Screen name="checkin" options={{ title: "Check-in" }} />
      </Tabs>

      {/* Persistent shared WebView — always mounted, sits above tab content,
          leaves tab bar free at the bottom. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: TAB_BAR_HEIGHT,
        }}
      >
        <WebViewScreen />
      </View>
    </View>
  );
}
