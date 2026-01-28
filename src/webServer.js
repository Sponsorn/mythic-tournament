const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const stateManager = require('./stateManager');
const { updateTeam, upsertTeam, findTeam, renameTeamInLeaderboard, saveTeams, getTeams, getBestRunsPerDungeon, getAllDungeonNames, readScoresAsObjects } = require('./wclStorage');
const { wclExtractCode } = require('./wclApi');
const { DUNGEON_PAR_MS, DUNGEON_SHORT_NAMES } = require('./wclScoring');
const { CORS_ORIGINS, ADMIN_SECRET, OBS_WS_PORT } = require('./config');

let io = null;
let server = null;
let forceRefreshCallback = null;
let stateListeners = [];

function validateRequired(data, fields) {
  if (!data || typeof data !== 'object') return 'Invalid request data';
  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

function createWebServer(config = {}) {
  const port = config.port || process.env.WEB_PORT || 3000;
  const host = config.host || process.env.WEB_HOST || '0.0.0.0';

  const app = express();
  server = http.createServer(app);

  // OBS WebSocket proxy - must be set up BEFORE Socket.io to handle /obs-ws upgrades
  const obsWsProxy = createProxyMiddleware({
    target: `ws://127.0.0.1:${OBS_WS_PORT}`,
    ws: true,
    changeOrigin: true,
    logger: console,
    on: {
      proxyReqWs: (proxyReq, req, socket) => {
        console.log(`[OBS-WS] Proxying WebSocket connection to OBS`);
      },
      error: (err, req, res) => {
        console.error(`[OBS-WS] Proxy error:`, err.message);
      },
    },
  });

  // Handle WebSocket upgrades for OBS proxy BEFORE Socket.io attaches
  server.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/obs-ws')) {
      console.log(`[OBS-WS] Handling upgrade for ${req.url}`);
      obsWsProxy.upgrade(req, socket, head);
    }
    // Other upgrades (like /socket.io) will be handled by Socket.io
  });

  // Initialize Socket.io with CORS
  const corsOrigin = CORS_ORIGINS
    ? CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : '*';
  io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  // Serve static files from public directory
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  app.use(express.json());

  // HTTP route for OBS WebSocket (for non-upgrade requests)
  app.use('/obs-ws', obsWsProxy);

  // API endpoints
  app.get('/api/state', (req, res) => {
    res.json(stateManager.getFullState());
  });

  app.get('/api/leaderboard', (req, res) => {
    res.json(stateManager.getLeaderboard());
  });

  app.get('/api/active-runs', (req, res) => {
    res.json(stateManager.getActiveRuns());
  });

  app.get('/api/quota', (req, res) => {
    res.json(stateManager.getApiQuota());
  });

  app.get('/api/teams', (req, res) => {
    res.json(stateManager.state.teams);
  });

  app.get('/api/dungeons', (req, res) => {
    res.json(getAllDungeonNames());
  });

  app.get('/api/best-times', (req, res) => {
    const dungeon = req.query.dungeon || null;
    res.json(getBestRunsPerDungeon(dungeon));
  });

  app.get('/api/dungeon-pars', (req, res) => {
    res.json(DUNGEON_PAR_MS);
  });

  app.get('/api/dungeon-short-names', (req, res) => {
    res.json(DUNGEON_SHORT_NAMES);
  });

  // Team stats (highest key, total deaths, unique dungeons per team)
  app.get('/api/team-stats', (req, res) => {
    const scores = readScoresAsObjects();
    const stats = {};

    for (const run of scores) {
      const team = run.team;
      if (!team) continue;

      if (!stats[team]) {
        stats[team] = {
          highestKey: 0,
          totalDeaths: 0,
          dungeons: new Set(),
        };
      }

      if (run.level > stats[team].highestKey) {
        stats[team].highestKey = run.level;
      }
      stats[team].totalDeaths += run.deaths || 0;
      if (run.dungeon) {
        stats[team].dungeons.add(run.dungeon);
      }
    }

    // Convert Sets to counts
    const result = {};
    for (const [team, data] of Object.entries(stats)) {
      result[team] = {
        highestKey: data.highestKey,
        totalDeaths: data.totalDeaths,
        uniqueDungeons: data.dungeons.size,
      };
    }

    res.json(result);
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    // Check admin auth from handshake
    const isAdmin = !ADMIN_SECRET || socket.handshake.auth?.secret === ADMIN_SECRET;

    function requireAdmin() {
      if (!isAdmin) {
        socket.emit('admin:response', { success: false, message: 'Unauthorized' });
        return false;
      }
      return true;
    }

    // Send full state on connect
    socket.emit('state:sync', stateManager.getFullState());

    // Admin: Update team report code (legacy)
    socket.on('admin:setReportCode', async (data) => {
      if (!requireAdmin()) return;
      const { teamName, teamNumber, reportCode, backupCode } = data;

      const code = wclExtractCode(reportCode);
      const backup = backupCode ? wclExtractCode(backupCode) : null;

      const result = updateTeam({
        teamName,
        teamNumber,
        wclUrl: code ? `https://www.warcraftlogs.com/reports/${code}` : '',
        wclBackupUrl: backup ? `https://www.warcraftlogs.com/reports/${backup}` : undefined,
      });

      if (result.status === 'updated') {
        stateManager.refreshTeams();
        io.emit('teams:update', stateManager.state.teams);
        socket.emit('admin:response', { success: true, message: 'Report code updated' });
      } else {
        socket.emit('admin:response', { success: false, message: 'Team not found' });
      }
    });

    // Admin: Update team (name, leader, report codes, bracket)
    socket.on('admin:updateTeam', async (data) => {
      if (!requireAdmin()) return;
      const validationError = validateRequired(data, ['originalName']);
      if (validationError) {
        socket.emit('admin:response', { success: false, message: validationError });
        return;
      }
      const { originalName, newTeamName, leaderName, reportCode, backupCode, bracket } = data;

      const code = wclExtractCode(reportCode);
      const backup = backupCode ? wclExtractCode(backupCode) : null;

      // Find the team by original name first
      const existingTeam = findTeam(originalName);
      if (!existingTeam) {
        socket.emit('admin:response', { success: false, message: 'Team not found' });
        return;
      }

      const result = updateTeam({
        teamName: originalName,
        leaderName: leaderName || existingTeam.leader_name,
        wclUrl: code ? `https://www.warcraftlogs.com/reports/${code}` : '',
        wclBackupUrl: backup ? `https://www.warcraftlogs.com/reports/${backup}` : undefined,
        bracket: bracket,
      });

      // If team name changed, rename in leaderboard and update team record
      if (newTeamName && newTeamName !== originalName && result.status === 'updated') {
        renameTeamInLeaderboard(originalName, newTeamName);
        result.team.team_name = newTeamName;
        saveTeams(getTeams());
      }

      if (result.status === 'updated') {
        stateManager.refreshTeams();
        stateManager.refreshLeaderboard();
        io.emit('teams:update', stateManager.state.teams);
        io.emit('scoreboard:update', stateManager.getLeaderboard());
        socket.emit('admin:response', { success: true, message: `Team "${newTeamName || originalName}" updated` });
      } else {
        socket.emit('admin:response', { success: false, message: 'Failed to update team' });
      }
    });

    // Admin: Force refresh a team
    socket.on('admin:forceRefresh', async (data) => {
      if (!requireAdmin()) return;
      const validationError = validateRequired(data, ['teamName']);
      if (validationError) {
        socket.emit('admin:response', { success: false, message: validationError });
        return;
      }
      const { teamName } = data;
      if (forceRefreshCallback) {
        try {
          await forceRefreshCallback(teamName);
          socket.emit('admin:response', { success: true, message: `Refreshed ${teamName}` });
        } catch (err) {
          socket.emit('admin:response', { success: false, message: err.message });
        }
      } else {
        socket.emit('admin:response', { success: false, message: 'Refresh not available' });
      }
    });

    // Admin: Tournament control
    socket.on('admin:tournament', (data) => {
      if (!requireAdmin()) return;
      const { action } = data;
      if (action === 'pause') {
        stateManager.setTournamentStatus('paused');
        io.emit('tournament:status', { status: 'paused' });
      } else if (action === 'resume') {
        stateManager.setTournamentStatus('active');
        io.emit('tournament:status', { status: 'active' });
      }
      socket.emit('admin:response', { success: true, message: `Tournament ${action}d` });
    });

    // Admin: Toggle active run (set team as active without dungeon details)
    socket.on('admin:toggleActiveRun', (data) => {
      if (!requireAdmin()) return;
      const validationError = validateRequired(data, ['teamName']);
      if (validationError) {
        socket.emit('admin:response', { success: false, message: validationError });
        return;
      }
      const { teamName, active } = data;
      console.log(`[Admin] Toggle active run: ${teamName} -> ${active}`);

      // Verify team exists
      const team = findTeam(teamName);
      if (!team) {
        socket.emit('admin:response', { success: false, message: 'Team not found' });
        return;
      }

      if (active) {
        // Set as active without dungeon details
        stateManager.onRunStart(teamName, {
          fightId: `manual-${Date.now()}`,
          dungeonName: null,
          keystoneLevel: null,
          startTime: Date.now(),
          totalBosses: 3,
          parTime: 1800000,
        });
        socket.emit('admin:response', { success: true, message: `${teamName} set as active` });
      } else {
        // Clear the run using proper method
        const hadRun = stateManager.onRunClear(teamName);
        socket.emit('admin:response', {
          success: true,
          message: hadRun ? `${teamName} set as idle` : `${teamName} was not active`
        });
      }
    });

    // Admin: Set run details for an active team
    socket.on('admin:setRunDetails', (data) => {
      if (!requireAdmin()) return;
      const validationError = validateRequired(data, ['teamName', 'dungeonName', 'keystoneLevel']);
      if (validationError) {
        socket.emit('admin:response', { success: false, message: validationError });
        return;
      }
      const { teamName, dungeonName, keystoneLevel } = data;

      // Find existing active run
      const run = stateManager.state.activeRuns.find(r => r.teamName === teamName);
      if (!run) {
        socket.emit('admin:response', { success: false, message: `${teamName} is not active` });
        return;
      }

      // Update dungeon details
      run.dungeonName = dungeonName;
      run.keystoneLevel = keystoneLevel;

      // Get par time for dungeon
      const slug = dungeonName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      run.parTime = DUNGEON_PAR_MS[slug] || 1800000;

      // Broadcast update
      io.emit('activeRuns:update', stateManager.state.activeRuns);
      socket.emit('admin:response', { success: true, message: `${teamName} details updated` });
    });

    // Admin: Clear active run manually (legacy, kept for compatibility)
    socket.on('admin:clearActiveRun', (data) => {
      if (!requireAdmin()) return;
      const { teamName } = data;
      const hadRun = stateManager.onRunClear(teamName);
      socket.emit('admin:response', {
        success: true,
        message: hadRun ? `${teamName} run cleared` : `${teamName} was not running`
      });
    });

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });

  // Forward state manager events to WebSocket clients
  stateListeners = [];

  function addStateListener(event, handler) {
    stateManager.on(event, handler);
    stateListeners.push({ event, handler });
  }

  addStateListener('scoreboard:update', (leaderboard) => {
    io.emit('scoreboard:update', leaderboard);
  });

  addStateListener('activeRuns:update', (activeRuns) => {
    io.emit('activeRuns:update', activeRuns);
  });

  addStateListener('run:start', (data) => {
    io.emit('run:start', data);
  });

  addStateListener('run:progress', (data) => {
    io.emit('run:progress', data);
  });

  addStateListener('run:complete', (data) => {
    io.emit('run:complete', data);
  });

  addStateListener('quota:update', (quota) => {
    io.emit('quota:update', quota);
  });

  addStateListener('teams:update', (teams) => {
    io.emit('teams:update', teams);
  });

  addStateListener('poll:complete', (data) => {
    io.emit('poll:complete', data);
  });

  // Start server
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`[WebServer] Running at http://${host}:${port}`);
      console.log(`[WebServer] Overlays available at:`);
      console.log(`  - Stream Overlay (1920x300): http://${host}:${port}/overlays/stream-overlay.html`);
      console.log(`  - Scoreboard Fullscreen: http://${host}:${port}/overlays/scoreboard-fullscreen.html`);
      console.log(`  - Best Times (1920x1080): http://${host}:${port}/overlays/best-times-overlay.html`);
      console.log(`  - Commands (576x108): http://${host}:${port}/overlays/commands-overlay.html`);
      console.log(`  - Admin: http://${host}:${port}/admin/`);
      console.log(`  - OBS WebSocket proxy: ws://${host}:${port}/obs-ws`);
      resolve({ app, server, io });
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

function setForceRefreshCallback(callback) {
  forceRefreshCallback = callback;
}

function broadcast(event, data) {
  if (io) {
    io.emit(event, data);
  }
}

function getIO() {
  return io;
}

function stopServer() {
  // Remove state manager listeners to prevent leaks
  for (const { event, handler } of stateListeners) {
    stateManager.removeListener(event, handler);
  }
  stateListeners = [];

  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('[WebServer] Stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  createWebServer,
  setForceRefreshCallback,
  broadcast,
  getIO,
  stopServer,
};
