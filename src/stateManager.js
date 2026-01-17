const EventEmitter = require('events');
const {
  getTeams,
  readLeaderboardWcl,
  readWclMeta,
  readScores,
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
      status: 'idle', // 'idle', 'running', 'completed'
      lastRun: meta[team.team_name]?.last || null,
      runCount: meta[team.team_name]?.runs || 0,
    }));
  }

  refreshLeaderboard() {
    const leaderboardData = readLeaderboardWcl();
    const meta = readWclMeta();

    const entries = Object.entries(leaderboardData).map(([teamName, points]) => ({
      teamName,
      points: points || 0,
      runs: meta[teamName]?.runs || 0,
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
      dungeonName: runData.dungeonName || 'Unknown Dungeon',
      keystoneLevel: runData.keystoneLevel || 0,
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

    this.emit('run:complete', { teamName, recap });
    this.emit('activeRuns:update', this.state.activeRuns);
    this.emit('scoreboard:update', this.state.leaderboard);
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

  // Track API quota
  recordApiRequest() {
    const now = Date.now();

    // Reset if hour has passed
    if (now >= this.state.apiQuota.resetTime) {
      this.quotaRequests = [];
      this.state.apiQuota.resetTime = now + 3600000;
    }

    // Add request timestamp
    this.quotaRequests.push(now);

    // Prune old requests (older than 1 hour)
    const oneHourAgo = now - 3600000;
    this.quotaRequests = this.quotaRequests.filter(t => t > oneHourAgo);

    this.state.apiQuota.used = this.quotaRequests.length;

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
  onPollComplete() {
    this.state.lastPollTime = Date.now();
    this.emit('poll:complete', { time: this.state.lastPollTime });
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

module.exports = stateManager;
