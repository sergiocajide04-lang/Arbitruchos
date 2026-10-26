export function useRegisterSW() {
  const noop = () => undefined;
  return { needRefresh: [false, noop], offlineReady: [false, noop], updateServiceWorker: async () => undefined };
}
