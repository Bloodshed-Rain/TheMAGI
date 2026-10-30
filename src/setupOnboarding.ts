export function shouldOfferSetup(config: {
  setupCompletedAt?: unknown;
  setupDeferred?: unknown;
  targetPlayer?: unknown;
  connectCode?: unknown;
  replayFolder?: unknown;
}): boolean {
  // Existing installations keep their current workflow; Settings can reopen setup.
  return (
    !config.setupCompletedAt &&
    !config.setupDeferred &&
    !config.targetPlayer &&
    !config.connectCode &&
    !config.replayFolder
  );
}
