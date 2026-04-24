import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useWebViewStore } from "../store/webviewStore";

export default function Clienti() {
  const setUrl = useWebViewStore((s) => s.setUrl);

  useFocusEffect(
    useCallback(() => {
      setUrl("/agent/clienti");
    }, [setUrl]),
  );

  return null;
}
