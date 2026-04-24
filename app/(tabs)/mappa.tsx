import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useWebViewStore } from "../store/webviewStore";

export default function Mappa() {
  const setUrl = useWebViewStore((s) => s.setUrl);

  useFocusEffect(
    useCallback(() => {
      setUrl("/agent/mappa");
    }, [setUrl]),
  );

  return null;
}
