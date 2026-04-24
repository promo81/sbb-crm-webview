import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useWebViewStore } from "../store/webviewStore";

export default function Dashboard() {
  const setUrl = useWebViewStore((s) => s.setUrl);

  useFocusEffect(
    useCallback(() => {
      setUrl("/agent/dashboard");
    }, [setUrl]),
  );

  return null;
}
