import { create } from "zustand";

type WebViewStore = {
  url: string;
  setUrl: (url: string) => void;
};

export const useWebViewStore = create<WebViewStore>((set, get) => ({
  url: "/agent/dashboard",
  setUrl: (url) => {
    const currentUrl = get().url;
    const same = currentUrl === url;
    if (__DEV__) {
      console.log("STORE setUrl", { from: currentUrl, to: url, same });
      if (same) {
        console.log("STORE setUrl IGNORED (idempotent)", { url });
      }
    }
    if (same) return;
    set({ url });
  },
}));
