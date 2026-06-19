import type { PalmierApi } from "../preload/preload";

declare global {
  interface Window {
    palmier: PalmierApi;
  }
}

export {};
