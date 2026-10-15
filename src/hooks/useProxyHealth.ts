import { useSyncExternalStore } from "react";
import { proxyHealth } from "~/utils/article/tools";
import type { ProxyHealthState } from "~/utils/net/proxyHealth";

/** Live CORS proxy health (#86): problem, when it was seen, last probe. */
export function useProxyHealth(): ProxyHealthState {
  return useSyncExternalStore(proxyHealth.subscribe, proxyHealth.getState);
}
