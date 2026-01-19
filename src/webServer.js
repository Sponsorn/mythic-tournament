const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const stateManager = require('./stateManager');
const { updateTeam, upsertTeam, findTeam, renameTeamInLeaderboard, saveTeams, getTeams, getBestRunsPerDungeon, getAllDungeonNames, readScoresAsObjects } = require('./wclStorage');
const { wclExtractCode } = require('./wclApi');
const { DUNGEON_PAR_MS, DUNGEON_SHORT_NAMES } = require('./wclScoring');

let io = null;
let server = null;
let forceRefreshCallback = null;

function createWebServer(config = {}) {
  const port = config.port || process.env.WEB_PORT || 3000;
  const host = config.host || process.env.WEB_HOST || '0.0.0.0';

  const app = express();
  server = http.createServer(app);

  // Initialize Socket.io with CORS for OBS browser sources
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Serve static files from public directory
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  app.use(express.json());

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

    // Send full state on connect
    socket.emit('state:sync', stateManager.getFullState());

    // Admin: Update team report code (legacy)
    socket.on('admin:setReportCode', async (data) => {
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

    // Admin: Trigger recap display
    socket.on('admin:showRecap', (data) => {
      const { runIndex, duration } = data;
      const run = stateManager.state.recentRuns[runIndex];
      if (run) {
        io.emit('recap:show', { recap: run, duration: duration || 15000 });
        socket.emit('admin:response', { success: true, message: 'Recap triggered' });
      } else {
        socket.emit('admin:response', { success: false, message: 'Run not found' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });

  // Forward state manager events to WebSocket clients
  stateManager.on('scoreboard:update', (leaderboard) => {
    io.emit('scoreboard:update', leaderboard);
  });

  stateManager.on('activeRuns:update', (activeRuns) => {
    io.emit('activeRuns:update', activeRuns);
  });

  stateManager.on('run:start', (data) => {
    io.emit('run:start', data);
  });

  stateManager.on('run:progress', (data) => {
    io.emit('run:progress', data);
  });

  stateManager.on('run:complete', (data) => {
    io.emit('run:complete', data);
    // Auto-show recap
    io.emit('recap:show', { recap: data.recap, duration: 15000 });
  });

  stateManager.on('quota:update', (quota) => {
    io.emit('quota:update', quota);
  });

  stateManager.on('teams:update', (teams) => {
    io.emit('teams:update', teams);
  });

  stateManager.on('poll:complete', (data) => {
    io.emit('poll:complete', data);
  });

  // Start server
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`[WebServer] Running at http://${host}:${port}`);
      console.log(`[WebServer] Overlays available at:`);
      console.log(`  - Stream Overlay (1920x300): http://${host}:${port}/overlays/stream-overlay.html`);
      console.log(`  - Scoreboard: http://${host}:${port}/overlays/scoreboard.html`);
      console.log(`  - Active Runs: http://${host}:${port}/overlays/active-runs.html`);
      console.log(`  - Recap: http://${host}:${port}/overlays/recap.html`);
      console.log(`  - Admin: http://${host}:${port}/admin/`);
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
