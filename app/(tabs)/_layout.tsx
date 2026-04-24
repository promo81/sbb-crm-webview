import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function Layout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: "#999",
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName = "home";

          if (route.name === "dashboard") iconName = "home";
          if (route.name === "clienti") iconName = "people";
          if (route.name === "mappa") iconName = "map";
          if (route.name === "agenda") iconName = "calendar";
          if (route.name === "checkin") iconName = "checkmark-circle";

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
      <Tabs.Screen name="clienti" options={{ title: "Clienti" }} />
      <Tabs.Screen name="mappa" options={{ title: "Mappa" }} />
      <Tabs.Screen name="agenda" options={{ title: "Agenda" }} />
      <Tabs.Screen name="checkin" options={{ title: "Check-in" }} />
    </Tabs>
  );
}
