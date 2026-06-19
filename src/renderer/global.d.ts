import type { SpikxApi } from "../preload/preload";

declare global {
  interface Window {
    spikx: SpikxApi;
  }
}

export {};
