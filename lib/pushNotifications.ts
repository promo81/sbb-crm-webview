import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const ALLOWED_URL_PREFIX = "/agent/";

export type PushDeviceMetadata = {
  platform: typeof Platform.OS;
  device_name: string | null;
  device_model: string | null;
  os_name: string | null;
  os_version: string | null;
  app_version: string | null;
  build_number: string | null;
  runtime_version: string | null;
  last_seen_at: string;
};

export type PushRegistrationPayload = PushDeviceMetadata & {
  token: string;
  expo_push_token: string;
};

export type NotificationOpenPayload = {
  type: "notification_open";
  url: string | null;
  action_identifier: string | null;
  notification_id: string | null;
  opened_at: string;
};

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

function readConstantsString(key: string): string | null {
  const value = (Constants as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getPushDeviceMetadata(): PushDeviceMetadata {
  return {
    platform: Platform.OS,
    device_name: Device.deviceName ?? null,
    device_model: Device.modelName ?? Device.modelId ?? null,
    os_name: Device.osName ?? Platform.OS,
    os_version: Device.osVersion ?? null,
    app_version:
      readConstantsString("nativeAppVersion") ??
      Constants.expoConfig?.version ??
      null,
    build_number:
      readConstantsString("nativeBuildVersion") ??
      Constants.expoConfig?.ios?.buildNumber ??
      Constants.expoConfig?.android?.versionCode?.toString() ??
      null,
    runtime_version:
      readConstantsString("expoRuntimeVersion") ??
      (typeof Constants.expoConfig?.runtimeVersion === "string"
        ? Constants.expoConfig.runtimeVersion
        : null),
    last_seen_at: new Date().toISOString(),
  };
}

export function buildPushRegistrationPayload(
  token: string,
): PushRegistrationPayload {
  return {
    token,
    expo_push_token: token,
    ...getPushDeviceMetadata(),
  };
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

export function getNotificationResponseId(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  const identifier = response?.notification?.request?.identifier;
  return typeof identifier === "string" && identifier.length > 0
    ? identifier
    : null;
}

export function isRecentNotificationResponse(
  response: Notifications.NotificationResponse | null | undefined,
  maxAgeMs = 5 * 60 * 1000,
): boolean {
  const date = response?.notification?.date;
  if (typeof date !== "number") return false;
  return Date.now() - date <= maxAgeMs;
}

export function buildNotificationOpenPayload(
  response: Notifications.NotificationResponse | null | undefined,
): NotificationOpenPayload {
  return {
    type: "notification_open",
    url: getNotificationUrl(response),
    action_identifier: response?.actionIdentifier ?? null,
    notification_id: getNotificationResponseId(response),
    opened_at: new Date().toISOString(),
  };
}
