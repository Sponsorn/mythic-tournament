// Socket.io client wrapper for M+ Tournament overlays

class TournamentClient {
  constructor(options = {}) {
    this.socket = null;
    this.state = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.listeners = {};

    this.connect();
  }

  connect() {
    // Connect to the server (same origin)
    this.socket = io({
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('[Tournament] Connected to server');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Tournament] Disconnected:', reason);
      this.connected = false;
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Tournament] Connection error:', error.message);
      this.reconnectAttempts++;
      this.emit('error', error);
    });

    // State sync on initial connection
    this.socket.on('state:sync', (state) => {
      console.log('[Tournament] State synced');
      this.state = state;
      this.emit('state:sync', state);
    });

    // Scoreboard updates
    this.socket.on('scoreboard:update', (leaderboard) => {
      if (this.state) {
        this.state.leaderboard = leaderboard;
      }
      this.emit('scoreboard:update', leaderboard);
    });

    // Active runs updates
    this.socket.on('activeRuns:update', (activeRuns) => {
      if (this.state) {
        this.state.activeRuns = activeRuns;
      }
      this.emit('activeRuns:update', activeRuns);
    });

    // Run events
    this.socket.on('run:start', (data) => {
      this.emit('run:start', data);
    });

    this.socket.on('run:progress', (data) => {
      this.emit('run:progress', data);
    });

    this.socket.on('run:complete', (data) => {
      this.emit('run:complete', data);
    });

    // Recap show
    this.socket.on('recap:show', (data) => {
      this.emit('recap:show', data);
    });

    // Teams update
    this.socket.on('teams:update', (teams) => {
      if (this.state) {
        this.state.teams = teams;
      }
      this.emit('teams:update', teams);
    });

    // Quota update
    this.socket.on('quota:update', (quota) => {
      if (this.state) {
        this.state.apiQuota = quota;
      }
      this.emit('quota:update', quota);
    });

    // Tournament status
    this.socket.on('tournament:status', (data) => {
      if (this.state) {
        this.state.tournament.status = data.status;
      }
      this.emit('tournament:status', data);
    });

    // Admin response
    this.socket.on('admin:response', (response) => {
      this.emit('admin:response', response);
    });
  }

  // Event handling
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    for (const callback of this.listeners[event]) {
      try {
        callback(data);
      } catch (err) {
        console.error(`[Tournament] Error in ${event} handler:`, err);
      }
    }
  }

  // Admin actions
  setReportCode(teamName, reportCode, backupCode = null) {
    this.socket.emit('admin:setReportCode', { teamName, reportCode, backupCode });
  }

  updateTeam(originalName, newTeamName, leaderName, reportCode, backupCode = null) {
    this.socket.emit('admin:updateTeam', { originalName, newTeamName, leaderName, reportCode, backupCode });
  }

  forceRefresh(teamName) {
    this.socket.emit('admin:forceRefresh', { teamName });
  }

  pauseTournament() {
    this.socket.emit('admin:tournament', { action: 'pause' });
  }

  resumeTournament() {
    this.socket.emit('admin:tournament', { action: 'resume' });
  }

  showRecap(runIndex, duration = 15000) {
    this.socket.emit('admin:showRecap', { runIndex, duration });
  }

  // Getters
  getState() {
    return this.state;
  }

  getLeaderboard() {
    return this.state?.leaderboard || [];
  }

  getActiveRuns() {
    return this.state?.activeRuns || [];
  }

  getTeams() {
    return this.state?.teams || [];
  }

  isConnected() {
    return this.connected;
  }
}

// Utility functions
function formatTime(ms) {
  if (!ms || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatTimeWithSign(ms) {
  const sign = ms >= 0 ? '+' : '-';
  const absMs = Math.abs(ms);
  return sign + formatTime(absMs);
}

function formatNumber(num) {
  return num.toLocaleString();
}

// Animate number change
function animateNumber(element, targetValue, duration = 500) {
  const startValue = parseInt(element.textContent.replace(/,/g, '')) || 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing function
    const eased = 1 - Math.pow(1 - progress, 3);

    const currentValue = Math.round(startValue + (targetValue - startValue) * eased);
    element.textContent = formatNumber(currentValue);

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// Global instance
window.tournamentClient = null;

function initTournamentClient() {
  if (!window.tournamentClient) {
    window.tournamentClient = new TournamentClient();
  }
  return window.tournamentClient;
}
