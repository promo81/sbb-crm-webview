import { create } from "zustand";

type WebViewStore = {
  url: string;
  setUrl: (url: string) => void;
};

export const useWebViewStore = create<WebViewStore>((set) => ({
  url: "/agent/dashboard",
  setUrl: (url) => set({ url }),
}));
