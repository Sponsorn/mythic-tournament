const EventEmitter = require('events');
const {
  getTeams,
  readLeaderboardWcl,
  readWclMeta,
  readScoresAsObjects,
} = require('./wclStorage');

class StateManager extends EventEmitter {
  constructor() {
    super();
    this.state = {
      tournament: {
        name: 'M+ Tournament',
        status: 'active', // 'pending', 'active', 'paused', 'finished'
        round: 1,
      },
      teams: [],
      leaderboard: [],
      activeRuns: [],
      recentRuns: [],
      apiQuota: {
        used: 0,
        limit: 3600,
        resetTime: Date.now() + 3600000,
      },
      lastPollTime: null,
      nextPollMs: null,
      serverTime: Date.now(),
    };
    this.quotaRequests = [];
  }

  initialize() {
    this.refreshTeams();
    this.refreshLeaderboard();
    this.emit('initialized', this.getFullState());
  }

  refreshTeams() {
    const teams = getTeams();
    const meta = readWclMeta();

    this.state.teams = teams.map(team => ({
      id: team.team_number || 0,
      name: team.team_name || 'Unknown',
      shortName: (team.team_name || 'UNK').substring(0, 4).toUpperCase(),
      leaderName: team.leader_name || '',
      wclUrl: team.wcl_url || '',
      wclBackupUrl: team.wcl_backup_url || '',
      bracket: team.bracket || 'A',
      status: 'idle', // 'idle', 'running', 'completed'
      lastRun: meta[team.team_name]?.last || null,
      runCount: meta[team.team_name]?.runs || 0,
    }));
  }

  refreshLeaderboard() {
    const leaderboardData = readLeaderboardWcl();
    const meta = readWclMeta();

    // Count actual runs from CSV (source of truth)
    const scores = readScoresAsObjects();
    const runCounts = {};
    for (const run of scores) {
      if (run.team && (run.in_time || run.points > 0)) {
        runCounts[run.team] = (runCounts[run.team] || 0) + 1;
      }
    }

    const entries = Object.entries(leaderboardData).map(([teamName, points]) => ({
      teamName,
      points: points || 0,
      runs: runCounts[teamName] || 0,
      lastRun: meta[teamName]?.last || null,
    }));

    // Sort by points desc, then runs desc, then name asc
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.runs !== a.runs) return b.runs - a.runs;
      return a.teamName.localeCompare(b.teamName);
    });

    // Add all teams even if they have 0 points
    const teamNames = new Set(entries.map(e => e.teamName));
    for (const team of this.state.teams) {
      if (!teamNames.has(team.name)) {
        entries.push({
          teamName: team.name,
          points: 0,
          runs: 0,
          lastRun: null,
        });
      }
    }

    // Re-sort and assign ranks
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.runs !== a.runs) return b.runs - a.runs;
      return a.teamName.localeCompare(b.teamName);
    });

    const previousRanks = {};
    for (const entry of this.state.leaderboard) {
      previousRanks[entry.teamName] = entry.rank;
    }

    this.state.leaderboard = entries.map((entry, index) => ({
      rank: index + 1,
      previousRank: previousRanks[entry.teamName] || index + 1,
      teamName: entry.teamName,
      points: entry.points,
      runs: entry.runs,
      lastRun: entry.lastRun,
      status: this.getTeamStatus(entry.teamName),
    }));
  }

  getTeamStatus(teamName) {
    const activeRun = this.state.activeRuns.find(r => r.teamName === teamName);
    if (activeRun) return 'running';
    return 'idle';
  }

  getFullState() {
    return {
      ...this.state,
      serverTime: Date.now(),
    };
  }

  getLeaderboard() {
    return this.state.leaderboard;
  }

  getActiveRuns() {
    return this.state.activeRuns;
  }

  // Called when a new run is detected (fight started)
  onRunStart(teamName, runData) {
    const run = {
      id: `${teamName}-${runData.fightId}`,
      teamName,
      fightId: runData.fightId,
      // Preserve null/undefined to indicate "waiting for details"
      dungeonName: runData.dungeonName !== undefined ? runData.dungeonName : 'Unknown Dungeon',
      keystoneLevel: runData.keystoneLevel !== undefined ? runData.keystoneLevel : 0,
      startTime: runData.startTime || Date.now(),
      progress: {
        percentage: 0,
        bossesKilled: 0,
        totalBosses: runData.totalBosses || 3,
        elapsed: 0,
      },
      deaths: 0,
      parTime: runData.parTime || 1800000,
    };

    // Remove any existing run for this team
    this.state.activeRuns = this.state.activeRuns.filter(r => r.teamName !== teamName);
    this.state.activeRuns.push(run);

    // Update team status
    this.updateTeamStatus(teamName, 'running');

    this.emit('run:start', { teamName, run });
    this.emit('activeRuns:update', this.state.activeRuns);
  }

  // Called to clear an active run manually
  onRunClear(teamName) {
    const hadRun = this.state.activeRuns.some(r => r.teamName === teamName);
    this.state.activeRuns = this.state.activeRuns.filter(r => r.teamName !== teamName);
    this.updateTeamStatus(teamName, 'idle');
    this.emit('activeRuns:update', this.state.activeRuns);
    return hadRun;
  }

  // Called when run progress is updated
  onRunProgress(teamName, progressData) {
    const run = this.state.activeRuns.find(r => r.teamName === teamName);
    if (!run) return;

    run.progress = {
      percentage: progressData.percentage || run.progress.percentage,
      bossesKilled: progressData.bossesKilled ?? run.progress.bossesKilled,
      totalBosses: progressData.totalBosses ?? run.progress.totalBosses,
      elapsed: progressData.elapsed || Date.now() - run.startTime,
    };
    run.deaths = progressData.deaths ?? run.deaths;

    this.emit('run:progress', { teamName, runId: run.id, progress: run.progress, deaths: run.deaths });
  }

  // Called when a run completes
  onRunComplete(teamName, runData) {
    // Capture pre-completion leaderboard snapshot for delta computation
    const prev = this.state.leaderboard.find(e => e.teamName === teamName);
    const previousRank = prev ? prev.rank : null;
    const previousTotal = prev ? prev.points : 0;
    const pointsEarned = Number(runData.points || 0);

    // Project the new total and rank based on the current leaderboard snapshot.
    // A follow-up scoreboard:update will correct any drift after refreshLeaderboard().
    const newTotal = previousTotal + pointsEarned;
    const projected = [...this.state.leaderboard]
      .map(e => e.teamName === teamName ? { ...e, points: newTotal } : e)
      .sort((a, b) => b.points - a.points);
    const newRankIndex = projected.findIndex(e => e.teamName === teamName);
    const newRank = newRankIndex >= 0 ? newRankIndex + 1 : null;

    // Remove from active runs
    this.state.activeRuns = this.state.activeRuns.filter(r => r.teamName !== teamName);

    // Update team status
    this.updateTeamStatus(teamName, 'idle');

    // Refresh leaderboard to get new scores
    this.refreshLeaderboard();

    const recap = {
      teamName,
      dungeonName: runData.dungeonName,
      keystoneLevel: runData.keystoneLevel,
      duration: runData.duration,
      parTime: runData.parTime,
      timeRemaining: runData.parTime - runData.duration,
      timed: runData.inTime,
      upgrades: runData.upgrades,
      deaths: runData.deaths,
      points: runData.points,
      blizzRating: runData.blizzRating || 0,
      completedAt: runData.completedAt || new Date().toISOString(),
    };

    // Add to recent runs (keep last 10)
    this.state.recentRuns.unshift(recap);
    if (this.state.recentRuns.length > 10) {
      this.state.recentRuns = this.state.recentRuns.slice(0, 10);
    }

    this.emit('run:complete', {
      teamName,
      pointsEarned,
      newTotal,
      newRank,
      previousRank,
      recap,
      ...runData,
    });
    this.emit('activeRuns:update', this.state.activeRuns);
    this.emit('scoreboard:update', this.state.leaderboard);
  }

  // Check for stale/abandoned runs (running longer than 2x par time)
  checkStaleRuns() {
    const now = Date.now();
    const staleRuns = this.state.activeRuns.filter(run => {
      const elapsed = now - run.startTime;
      const maxTime = (run.parTime || 1800000) * 2;
      return elapsed > maxTime;
    });

    for (const run of staleRuns) {
      console.log(`[StateManager] Auto-clearing stale run for ${run.teamName} (elapsed ${Math.round((now - run.startTime) / 60000)}m, par ${Math.round((run.parTime || 1800000) / 60000)}m)`);
      this.state.activeRuns = this.state.activeRuns.filter(r => r.teamName !== run.teamName);
      this.updateTeamStatus(run.teamName, 'idle');
    }

    if (staleRuns.length > 0) {
      this.emit('activeRuns:update', this.state.activeRuns);
    }

    return staleRuns.length;
  }

  updateTeamStatus(teamName, status) {
    const team = this.state.teams.find(t => t.name === teamName);
    if (team) {
      team.status = status;
    }

    // Also update leaderboard status
    const entry = this.state.leaderboard.find(e => e.teamName === teamName);
    if (entry) {
      entry.status = status;
    }
  }

  // Track API quota using real WCL rate limit data when available
  recordApiRequest(rateLimitData) {
    if (rateLimitData) {
      // Use actual WCL rate limit info
      const pointsSpentThisSecond = Number(rateLimitData.pointsSpentThisSecond || 0);
      const limitPerSecond = Number(rateLimitData.limitPerSecond || 100);
      const pointsResetIn = Number(rateLimitData.pointsResetIn || 0);

      this.state.apiQuota.used = Math.round(pointsSpentThisSecond);
      this.state.apiQuota.limit = Math.round(limitPerSecond);
      this.state.apiQuota.resetTime = Date.now() + (pointsResetIn * 1000);
    } else {
      // Fallback: local counting
      const now = Date.now();
      if (now >= this.state.apiQuota.resetTime) {
        this.quotaRequests = [];
        this.state.apiQuota.resetTime = now + 3600000;
      }
      this.quotaRequests.push(now);
      const oneHourAgo = now - 3600000;
      this.quotaRequests = this.quotaRequests.filter(t => t > oneHourAgo);
      this.state.apiQuota.used = this.quotaRequests.length;
    }

    this.emit('quota:update', this.state.apiQuota);
  }

  getApiQuota() {
    return {
      ...this.state.apiQuota,
      remaining: this.state.apiQuota.limit - this.state.apiQuota.used,
      percentage: (this.state.apiQuota.used / this.state.apiQuota.limit) * 100,
    };
  }

  shouldThrottle() {
    const quota = this.getApiQuota();
    return quota.percentage >= 80;
  }

  // Update poll time
  onPollComplete(nextPollMs = 30000) {
    this.state.lastPollTime = Date.now();
    this.state.nextPollMs = nextPollMs;
    this.emit('poll:complete', {
      time: this.state.lastPollTime,
      nextPollMs: nextPollMs
    });
  }

  // Tournament control
  setTournamentStatus(status) {
    this.state.tournament.status = status;
    this.emit('tournament:status', { status });
  }

  isPaused() {
    return this.state.tournament.status === 'paused';
  }
}

// Singleton instance
const stateManager = new StateManager();

// Test-only helper — allows unit tests to seed leaderboard state
StateManager.prototype._testSetLeaderboard = function (leaderboard) {
  this.state.leaderboard = leaderboard;
};

module.exports = stateManager;
