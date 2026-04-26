(function () {
  'use strict';

  const rootEl = document.getElementById('compositor');
  const brandEl = document.getElementById('brandStrip');
  const layoutRootEl = document.getElementById('layoutRoot');

  const state = {
    teams: [],
    leaderboard: [],
    activeRuns: [],
    directorState: null,
  };

  const layouts = {
    A: window.LayoutA,
    C: window.LayoutC,
    LB: window.LayoutLB,
    BT: window.LayoutBT,
  };

  let activeLayoutName = null;
  let activeLayoutInstance = null;

  const socket = io();

  socket.on('state:sync', (payload) => {
    state.teams = payload.teams || [];
    state.leaderboard = payload.leaderboard || [];
    state.activeRuns = payload.activeRuns || [];
    window.TwitchEmbedManager.syncTeams(state.teams);
    render();
  });

  socket.on('scoreboard:update', (lb) => {
    state.leaderboard = lb || [];
    render();
  });

  socket.on('activeRuns:update', (runs) => {
    state.activeRuns = runs || [];
    render();
  });

  socket.on('director:state', (ds) => {
    state.directorState = ds;
    render();
  });

  socket.on('run:complete', (payload) => {
    if (activeLayoutInstance && activeLayoutInstance.onRunComplete) {
      activeLayoutInstance.onRunComplete(payload);
    }
  });

  function render() {
    if (!state.directorState) return;

    window.BrandStrip.render(brandEl, {
      teams: state.teams,
      directorState: state.directorState,
    });

    let desired = state.directorState.activeLayout;
    if (!layouts[desired]) {
      console.warn(`[Compositor] Layout ${desired} not available in Phase 1, falling back to A`);
      desired = 'A';
    }
    if (desired !== activeLayoutName) {
      if (activeLayoutInstance && activeLayoutInstance.unmount) {
        activeLayoutInstance.unmount();
      }
      layoutRootEl.innerHTML = '';
      rootEl.className = `compositor layout-${desired}`;
      activeLayoutInstance = layouts[desired].mount(layoutRootEl);
      activeLayoutName = desired;
    }

    if (activeLayoutInstance && activeLayoutInstance.update) {
      activeLayoutInstance.update(state);
    }
  }
})();
