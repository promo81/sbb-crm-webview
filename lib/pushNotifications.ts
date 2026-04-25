import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const ALLOWED_URL_PREFIX = "/agent/";

export async function setupAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FFFFFF",
    });
  } catch {
    if (__DEV__) {
      console.log("Failed to setup Android notification channel");
    }
  }
}

function resolveProjectId(): string | null {
  const easProjectId =
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig
      ?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    null;
  return typeof easProjectId === "string" && easProjectId.length > 0
    ? easProjectId
    : null;
}

export async function registerForPushNotificationsAsync(): Promise<
  string | null
> {
  try {
    if (!Device.isDevice) {
      if (__DEV__) {
        console.log("Push notifications skipped: not a physical device");
      }
      return null;
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      if (__DEV__) {
        console.log("Push notifications permission not granted");
      }
      return null;
    }

    const projectId = resolveProjectId();
    if (!projectId) {
      if (__DEV__) {
        console.log(
          "Push notifications skipped: missing EAS projectId in app config",
        );
      }
      return null;
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    if (__DEV__) {
      console.log("Push token acquired");
    }

    return tokenResult?.data ?? null;
  } catch (error) {
    if (__DEV__) {
      const err = error as { name?: string; message?: string; code?: unknown };
      let permissionStatus: string | null = null;
      try {
        const { status } = await Notifications.getPermissionsAsync();
        permissionStatus = status;
      } catch {
        permissionStatus = "unknown";
      }
      console.log("Failed to register for push notifications", {
        name: err?.name ?? null,
        message: err?.message ?? null,
        code: err?.code ?? null,
        projectId: resolveProjectId(),
        isDevice: Device.isDevice,
        permissionStatus,
      });
    }
    return null;
  }
}

export function getNotificationUrl(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  try {
    const data = response?.notification?.request?.content?.data as
      | { url?: unknown }
      | undefined;
    const url = data?.url;
    if (typeof url === "string" && url.startsWith(ALLOWED_URL_PREFIX)) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}
