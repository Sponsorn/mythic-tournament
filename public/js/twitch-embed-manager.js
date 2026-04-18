(function () {
  'use strict';

  const QUALITY_FOCUS = '720p30';
  const QUALITY_OFFSCREEN = '480p30';

  const embeds = {}; // teamName → { player, container, lastQuality, currentParent }
  const hiddenHost = document.createElement('div');
  hiddenHost.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:640px;height:360px;pointer-events:none;';
  document.body.appendChild(hiddenHost);

  let allMuted = true;
  let unmutedTeam = null;

  function buildEmbed(team) {
    if (!team.twitchChannel) return null;
    const container = document.createElement('div');
    container.className = 'twitch-embed-host';
    container.style.cssText = 'width:100%;height:100%;';
    hiddenHost.appendChild(container);

    const player = new Twitch.Player(container, {
      channel: team.twitchChannel,
      width: '100%',
      height: '100%',
      muted: true,
      autoplay: true,
      parent: [window.location.hostname],
    });

    player.addEventListener(Twitch.Player.PLAYING, () => {
      try {
        const qualities = player.getQualities ? player.getQualities() : [];
        const target = QUALITY_OFFSCREEN;
        const match = qualities.find(q => q.group === target) ||
                      qualities.find(q => q.group === '360p30') ||
                      qualities.find(q => q.group === '160p30');
        if (match) player.setQuality(match.group);
      } catch (err) {
        console.warn('[Twitch] setQuality failed for', team.twitchChannel, err);
      }
    });

    return { player, container, currentParent: hiddenHost, lastQuality: QUALITY_OFFSCREEN };
  }

  function syncTeams(teams) {
    const seen = new Set();
    teams.forEach(team => {
      if (!team.twitchChannel) return;
      seen.add(team.name);
      if (!embeds[team.name]) {
        const embed = buildEmbed(team);
        if (embed) embeds[team.name] = embed;
      }
    });
    Object.keys(embeds).forEach(name => {
      if (!seen.has(name)) {
        try { embeds[name].player.pause(); } catch {}
        embeds[name].container.remove();
        delete embeds[name];
      }
    });
  }

  function mountInto(teamName, slotEl, options) {
    if (!teamName || !slotEl) return;
    const embed = embeds[teamName];
    if (!embed) {
      slotEl.innerHTML = `<div class="stream-tile-offline">${escapeHtml(teamName)} — no stream</div>`;
      return;
    }
    if (embed.currentParent !== slotEl) {
      slotEl.appendChild(embed.container);
      embed.currentParent = slotEl;
    }
    const desired = options && options.focused ? QUALITY_FOCUS : QUALITY_OFFSCREEN;
    if (desired !== embed.lastQuality) {
      try {
        const qualities = embed.player.getQualities ? embed.player.getQualities() : [];
        const match = qualities.find(q => q.group === desired);
        if (match) {
          embed.player.setQuality(match.group);
          embed.lastQuality = desired;
        }
      } catch {}
    }
  }

  function setMainAudio(unmuted, focusedTeam) {
    allMuted = !unmuted;
    unmutedTeam = unmuted ? focusedTeam : null;
    Object.entries(embeds).forEach(([name, e]) => {
      try {
        const shouldUnmute = unmuted && name === focusedTeam;
        e.player.setMuted(!shouldUnmute);
      } catch {}
    });
  }

  function detachAll() {
    Object.values(embeds).forEach(e => {
      if (e.currentParent !== hiddenHost) {
        hiddenHost.appendChild(e.container);
        e.currentParent = hiddenHost;
      }
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.TwitchEmbedManager = { syncTeams, mountInto, setMainAudio, detachAll };
})();
