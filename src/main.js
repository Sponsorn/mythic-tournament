require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { collectRunsAndSync } = require('./wclCollector');
const {
  ensureFiles: ensureWclFiles,
  reloadData: reloadWclData,
  listTeams,
  upsertTeam,
  updateTeam,
  findTeam,
  findTeamByNumber,
  getSeenWcl,
  readLeaderboardWcl,
  readWclMeta,
  readScores,
  SCORE_HEADER,
  setTeamNumber,
} = require('./wclStorage');
const { formatLocalTime, formatTable } = require('./wclUtils');
const { createWebServer, setForceRefreshCallback } = require('./webServer');
const stateManager = require('./stateManager');
const {
  WEB_PORT,
  WEB_HOST,
  POLL_INTERVAL_ACTIVE_MS,
  POLL_INTERVAL_IDLE_MS,
  ANNOUNCE_CHANNEL_ID,
  COMMANDS_CHANNEL_ID,
  REALM_TZ,
  hasWclCredentials,
} = require('./config');

const EPHEMERAL_FLAG = 1 << 6;
const WCL_TEAM_MODAL = 'wcl-team-setup';

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds],
});

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
  }
}

// Set up the force refresh callback for admin panel
setForceRefreshCallback(async (teamName) => {
  console.log(`[Main] Force refresh requested for: ${teamName}`);
  await pollWclRuns(discordClient, teamName);
});

discordClient.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  ensureWclFiles();

  // Start web server
  await initializeWebServer();

  // Start adaptive WCL polling
  startAdaptivePolling(readyClient);
});

// Adaptive polling based on active runs
function startAdaptivePolling(clientRef) {
  if (!hasWclCredentials()) {
    console.warn('[Main] WCL polling skipped: missing credentials');
    return;
  }

  async function poll() {
    if (stateManager.isPaused()) {
      console.log('[Main] Polling paused');
      scheduleNextPoll();
      return;
    }

    try {
      await pollWclRuns(clientRef);
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

    console.log(`[Main] Next poll in ${interval / 1000}s (active runs: ${hasActiveRuns})`);
  }

  // Initial poll
  poll();
}

function isCommandsChannel(interaction) {
  if (!COMMANDS_CHANNEL_ID) return true;
  if (interaction.channelId === COMMANDS_CHANNEL_ID) return true;
  return interaction.channel?.parentId === COMMANDS_CHANNEL_ID;
}

function encodeTeamKey(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

function decodeTeamKey(value) {
  try {
    return Buffer.from(String(value || ''), 'base64').toString('utf8');
  } catch (err) {
    return '';
  }
}

async function resolveTextChannel(clientRef, channelId) {
  if (!channelId) return null;
  const { ChannelType } = require('discord.js');
  const channel = await clientRef.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

async function pollWclRuns(clientRef, specificTeam = null) {
  if (!hasWclCredentials()) {
    if (!wclCredsWarned) {
      console.warn('WCL polling skipped: missing WCL_CLIENT_ID/WCL_CLIENT_SECRET');
      wclCredsWarned = true;
    }
    return;
  }

  // Track API request
  stateManager.recordApiRequest();

  const { publicMsgs, privateMsgs, newCount } = await collectRunsAndSync();

  // Update state manager
  stateManager.refreshTeams();
  stateManager.refreshLeaderboard();
  stateManager.onPollComplete();

  // Process completed runs for state manager
  if (newCount > 0) {
    stateManager.emit('scoreboard:update', stateManager.getLeaderboard());
  }

  if (!publicMsgs.length && !privateMsgs.length) return;

  const announceChannel = await resolveTextChannel(clientRef, ANNOUNCE_CHANNEL_ID);
  const commandsChannel = await resolveTextChannel(clientRef, COMMANDS_CHANNEL_ID);

  if (newCount && announceChannel) {
    for (const msg of publicMsgs) {
      await announceChannel.send(msg);
    }
  }
  if (privateMsgs.length && commandsChannel) {
    for (const msg of privateMsgs) {
      await commandsChannel.send(msg);
    }
  }
}

discordClient.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isModalSubmit()) {
    if (interaction.customId === WCL_TEAM_MODAL || interaction.customId.startsWith(`${WCL_TEAM_MODAL}:`)) {
      let targetName = null;
      let targetNumber = null;
      if (interaction.customId.startsWith(`${WCL_TEAM_MODAL}:edit:`)) {
        const [, , kind, encoded] = interaction.customId.split(':');
        if (kind === 'name') {
          targetName = decodeTeamKey(encoded);
        } else if (kind === 'number') {
          targetNumber = Number(encoded);
        }
      }
      const teamName = interaction.fields.getTextInputValue('wcl-team-name')?.trim();
      const leaderName = interaction.fields.getTextInputValue('wcl-team-leader')?.trim();
      const wclMain = interaction.fields.getTextInputValue('wcl-team-main')?.trim();
      const wclBackup = interaction.fields.getTextInputValue('wcl-team-backup')?.trim();
      const teamNumberInput = interaction.fields.getTextInputValue('wcl-team-number')?.trim();

      if (!teamName || !leaderName || !wclMain) {
        await interaction.reply({
          content: 'Team name, leader name, and WCL main link are required.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      const result = targetName || Number.isFinite(targetNumber)
        ? updateTeam({
            teamName,
            teamNumber: Number.isFinite(targetNumber) ? targetNumber : undefined,
            leaderName,
            wclUrl: wclMain,
            wclBackupUrl: wclBackup,
          })
        : upsertTeam({
            teamName,
            leaderName,
            wclUrl: wclMain,
            wclBackupUrl: wclBackup,
          });

      if (result.status === 'missing') {
        await interaction.reply({
          content: 'Team not found.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      if (teamNumberInput) {
        const parsed = Number(teamNumberInput);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          await interaction.reply({
            content: 'Team number must be a positive number.',
            flags: EPHEMERAL_FLAG,
          });
          return;
        }
        const setResult = setTeamNumber(teamName, parsed);
        if (setResult.status === 'conflict') {
          await interaction.reply({
            content: `Team number ${parsed} is already assigned to ${setResult.conflict.team_name}. Assigned ${setResult.fallback} instead.`,
            flags: EPHEMERAL_FLAG,
          });
          return;
        }
      }

      // Update state manager
      stateManager.refreshTeams();

      const msg = result.status === 'created'
        ? `Created team ${teamName}.`
        : `Updated team ${teamName}.`;
      await interaction.reply({ content: msg, flags: EPHEMERAL_FLAG });
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'wcl') {
    if (!isCommandsChannel(interaction)) {
      await interaction.reply({
        content: 'Commands are not allowed in here, sorry.',
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'scoreboard') {
      const leaderboard = readLeaderboardWcl();
      const seen = getSeenWcl();
      const meta = readWclMeta();
      const teams = listTeams();
      const teamIndex = new Map(
        teams.map((team, idx) => {
          const num = Number(team.team_number);
          return [
            String(team.team_name || ''),
            Number.isFinite(num) && num > 0 ? num : idx + 1,
          ];
        })
      );

      const runsByTeam = {};
      for (const key of seen) {
        const splitIdx = key.indexOf(':id:');
        if (!key.startsWith('team:') || splitIdx === -1) continue;
        const teamName = key.slice(5, splitIdx);
        runsByTeam[teamName] = (runsByTeam[teamName] || 0) + 1;
      }

      const teamSet = new Set([
        ...Object.keys(leaderboard || {}),
        ...Object.keys(meta || {}),
        ...teams.map((team) => team.team_name).filter(Boolean),
      ]);

      if (!teamSet.size) {
        await interaction.reply({ content: 'No teams configured.', flags: EPHEMERAL_FLAG });
        return;
      }

      const rows = [];
      for (const teamName of teamSet) {
        const points = Number(leaderboard[teamName] || 0);
        const runs = Number(runsByTeam[teamName] || 0);
        const lastIso = meta?.[teamName]?.last || '';
        const lastLocal = formatLocalTime(lastIso, REALM_TZ);
        const idx = teamIndex.get(teamName);
        const label = idx ? `${teamName} (Team ${idx})` : teamName;
        rows.push([label, points, runs, lastLocal]);
      }

      rows.sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        if (b[2] !== a[2]) return b[2] - a[2];
        return String(a[0]).localeCompare(String(b[0]));
      });

      const ranked = rows.map((row, idx) => [idx + 1, ...row]);
      const table = formatTable(
        ['Rank', 'Team name', 'Points', 'Runs', 'Last seen run (WCL)'],
        ranked
      );
      await interaction.reply(`\`\`\`\n${table}\n\`\`\``);
      return;
    }

    if (sub === 'teamruns') {
      const teamName = interaction.options.getString('team_name');
      const limit = interaction.options.getInteger('limit') ?? 10;
      const rows = readScores();

      if (!rows.length) {
        await interaction.reply('No runs yet.');
        return;
      }

      const idx = Object.fromEntries(SCORE_HEADER.map((key, i) => [key, i]));
      const output = [];

      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        const rowTeam = row[idx.team];
        if (teamName && rowTeam?.toLowerCase() !== teamName.toLowerCase()) {
          continue;
        }
        const status = Number(row[idx.in_time]) ? `+${row[idx.upgrades]}` : 'depleted';
        output.push([
          row[idx.finished_at_realm],
          row[idx.team],
          `${row[idx.dungeon]} +${row[idx.level]}`,
          status,
          row[idx.points],
          `${row[idx.character]}-${row[idx.realm]}`,
        ]);
        if (output.length >= Math.min(50, Math.max(1, limit))) {
          break;
        }
      }

      if (!output.length) {
        await interaction.reply('No runs found.');
        return;
      }

      const table = formatTable(
        ['When', 'Team', 'Key', 'Status', 'Points', 'Character'],
        output
      );
      await interaction.reply(`\`\`\`\n${table}\n\`\`\``);
      return;
    }

    if (sub === 'forcecheck') {
      if (!hasWclCredentials()) {
        await interaction.reply({
          content: 'WCL credentials are not configured.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      try {
        await interaction.deferReply({ flags: EPHEMERAL_FLAG });
      } catch (err) {
        if (err?.code === 10062) {
          console.warn('WCL forcecheck interaction expired before defer', err);
          return;
        }
        throw err;
      }

      try {
        const { publicMsgs, privateMsgs, newCount } = await collectRunsAndSync();
        stateManager.refreshTeams();
        stateManager.refreshLeaderboard();
        stateManager.onPollComplete();

        const announceChannel = await resolveTextChannel(discordClient, ANNOUNCE_CHANNEL_ID);
        const commandsChannel = await resolveTextChannel(discordClient, COMMANDS_CHANNEL_ID);

        if (newCount && announceChannel) {
          for (const msg of publicMsgs) {
            await announceChannel.send(msg);
          }
        }
        if (privateMsgs.length && commandsChannel) {
          for (const msg of privateMsgs) {
            await commandsChannel.send(msg);
          }
        }
        await interaction.editReply(`Poll done (new runs: ${newCount}).`);
      } catch (err) {
        console.warn('WCL forcecheck failed', err);
        await interaction.editReply('Poll failed.');
      }
      return;
    }

    if (sub === 'listteams') {
      const teams = listTeams();
      if (!teams.length) {
        await interaction.reply({ content: 'No teams configured.', flags: EPHEMERAL_FLAG });
        return;
      }

      const fields = teams.slice(0, 25).map((team) => {
        const leader = team.leader_name || 'n/a';
        const wcl = team.wcl_url || 'n/a';
        const backup = team.wcl_backup_url || 'n/a';
        const num = Number.isFinite(Number(team.team_number)) ? `Team ${team.team_number}` : 'Team n/a';
        return {
          name: team.team_name || 'Unnamed team',
          value: `${num}\nLeader: ${leader}\nWCL: ${wcl}\nBackup: ${backup}`,
          inline: false,
        };
      });

      const embed = {
        title: 'WCL Teams',
        fields,
      };
      await interaction.reply({ embeds: [embed], flags: EPHEMERAL_FLAG });
      return;
    }

    if (sub === 'team') {
      const modal = new ModalBuilder()
        .setCustomId(WCL_TEAM_MODAL)
        .setTitle('Team setup');

      const teamInput = new TextInputBuilder()
        .setCustomId('wcl-team-name')
        .setLabel('Team name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const leaderInput = new TextInputBuilder()
        .setCustomId('wcl-team-leader')
        .setLabel('Team leader name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const mainInput = new TextInputBuilder()
        .setCustomId('wcl-team-main')
        .setLabel('WCL main link/report')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const backupInput = new TextInputBuilder()
        .setCustomId('wcl-team-backup')
        .setLabel('WCL backup link/report (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const numberInput = new TextInputBuilder()
        .setCustomId('wcl-team-number')
        .setLabel('Team number (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(teamInput),
        new ActionRowBuilder().addComponents(leaderInput),
        new ActionRowBuilder().addComponents(mainInput),
        new ActionRowBuilder().addComponents(backupInput),
        new ActionRowBuilder().addComponents(numberInput)
      );
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'teamedit') {
      const teamName = interaction.options.getString('team_name');
      const teamNumber = interaction.options.getInteger('team_number');

      if (!teamName && !teamNumber) {
        await interaction.reply({
          content: 'Provide a team name or team number.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      const team = Number.isFinite(teamNumber)
        ? findTeamByNumber(teamNumber)
        : findTeam(teamName);

      if (!team) {
        await interaction.reply({
          content: 'Team not found.',
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(
          Number.isFinite(teamNumber)
            ? `${WCL_TEAM_MODAL}:edit:number:${teamNumber}`
            : `${WCL_TEAM_MODAL}:edit:name:${encodeTeamKey(team.team_name)}`
        )
        .setTitle('Edit team');

      const teamInput = new TextInputBuilder()
        .setCustomId('wcl-team-name')
        .setLabel('Team name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(team.team_name || '');

      const leaderInput = new TextInputBuilder()
        .setCustomId('wcl-team-leader')
        .setLabel('Team leader name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(team.leader_name || '');

      const mainInput = new TextInputBuilder()
        .setCustomId('wcl-team-main')
        .setLabel('WCL main link/report')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(team.wcl_url || '');

      const backupInput = new TextInputBuilder()
        .setCustomId('wcl-team-backup')
        .setLabel('WCL backup link/report (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(team.wcl_backup_url || '');

      const numberInput = new TextInputBuilder()
        .setCustomId('wcl-team-number')
        .setLabel('Team number (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(Number.isFinite(Number(team.team_number)) ? String(team.team_number) : '');

      modal.addComponents(
        new ActionRowBuilder().addComponents(teamInput),
        new ActionRowBuilder().addComponents(leaderInput),
        new ActionRowBuilder().addComponents(mainInput),
        new ActionRowBuilder().addComponents(backupInput),
        new ActionRowBuilder().addComponents(numberInput)
      );
      await interaction.showModal(modal);
      return;
    }

    if (sub === 'reloadteams') {
      reloadWclData();
      stateManager.refreshTeams();
      stateManager.refreshLeaderboard();
      await interaction.reply({ content: 'Teams reloaded from disk.', flags: EPHEMERAL_FLAG });
      return;
    }
  }
});

discordClient.login(process.env.DISCORD_TOKEN);
