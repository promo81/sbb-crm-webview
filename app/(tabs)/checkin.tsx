import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useWebViewStore } from "../store/webviewStore";

export default function Checkin() {
  const setUrl = useWebViewStore((s) => s.setUrl);

  useFocusEffect(
    useCallback(() => {
      setUrl("/agent/check-in");
    }, [setUrl]),
  );

  return null;
}
