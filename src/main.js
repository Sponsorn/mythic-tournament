require('dotenv').config();
const { collectRunsAndSync } = require('./wclCollector');
const { ensureFiles: ensureWclFiles } = require('./wclStorage');
const { createWebServer, setForceRefreshCallback } = require('./webServer');
const stateManager = require('./stateManager');
const {
  WEB_PORT,
  WEB_HOST,
  POLL_INTERVAL_ACTIVE_MS,
  POLL_INTERVAL_IDLE_MS,
  hasWclCredentials,
  validateConfig,
} = require('./config');

let wclCredsWarned = false;
let pollTimer = null;

// Initialize web server and state manager
async function initializeWebServer() {
  try {
    await createWebServer({ port: WEB_PORT, host: WEB_HOST });
    stateManager.initialize();
    console.log('[Main] Web server and state manager initialized');
  } catch (err) {
    console.error('[Main] Failed to start web server:', err.message);
    process.exit(1);
  }
}

// Set up the force refresh callback for admin panel
setForceRefreshCallback(async (teamName) => {
  console.log(`[Main] Force refresh requested for: ${teamName}`);
  await pollWclRuns();
});

// Adaptive polling based on active runs
function startAdaptivePolling() {
  if (!hasWclCredentials()) {
    console.warn('[Main] WCL polling disabled: missing WCL_CLIENT_ID/WCL_CLIENT_SECRET');
    return;
  }

  async function poll() {
    if (stateManager.isPaused()) {
      console.log('[Main] Polling paused');
      scheduleNextPoll();
      return;
    }

    try {
      await pollWclRuns();
    } catch (err) {
      console.warn('[Main] WCL poll failed:', err.message);
    }

    scheduleNextPoll();
  }

  function scheduleNextPoll() {
    const hasActiveRuns = stateManager.getActiveRuns().length > 0;
    const interval = hasActiveRuns ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;

    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, interval);

    // Notify clients of poll complete with next interval
    stateManager.onPollComplete(interval);

    console.log(`[Main] Next poll in ${interval / 1000}s (active runs: ${hasActiveRuns})`);
  }

  // Initial poll
  poll();
}

async function pollWclRuns() {
  if (!hasWclCredentials()) {
    if (!wclCredsWarned) {
      console.warn('[Main] WCL polling skipped: missing WCL_CLIENT_ID/WCL_CLIENT_SECRET');
      wclCredsWarned = true;
    }
    return;
  }

  // Track API request
  stateManager.recordApiRequest();

  const { privateMsgs, newCount, completedRuns } = await collectRunsAndSync();

  // Update state manager
  stateManager.refreshTeams();
  stateManager.refreshLeaderboard();

  // Process completed runs - clear active status for teams with finished runs
  if (completedRuns && completedRuns.length > 0) {
    for (const run of completedRuns) {
      // Clear active run status for this team (onRunComplete handles this)
      stateManager.onRunComplete(run.teamName, run);
    }
  } else if (newCount > 0) {
    // Fallback: just emit scoreboard update if we have new runs but no completedRuns data
    stateManager.emit('scoreboard:update', stateManager.getLeaderboard());
  }

  // Log poll results
  if (privateMsgs.length) {
    for (const msg of privateMsgs) {
      console.log(msg);
    }
  }

  if (newCount > 0) {
    console.log(`[Main] Poll complete: ${newCount} new run(s) detected`);
  }
}

// Main startup
async function main() {
  console.log('[Main] M+ Tournament Server starting...');

  // Validate config (now only checks WCL credentials as optional)
  try {
    validateConfig();
  } catch (err) {
    console.error('[Main] Configuration error:', err.message);
    process.exit(1);
  }

  // Ensure data files exist
  ensureWclFiles();

  // Start web server
  await initializeWebServer();

  // Start adaptive WCL polling
  startAdaptivePolling();

  console.log('[Main] Server started successfully');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Main] Shutting down...');
  if (pollTimer) clearTimeout(pollTimer);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Main] Received SIGTERM, shutting down...');
  if (pollTimer) clearTimeout(pollTimer);
  process.exit(0);
});

// Start the server
main().catch((err) => {
  console.error('[Main] Fatal error:', err);
  process.exit(1);
});
