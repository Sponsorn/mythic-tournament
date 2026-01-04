require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Show top reacted posts for the active competition')
    .addIntegerOption(opt =>
      opt
        .setName('limit')
        .setDescription('Number of posts to show')
        .addChoices({ name: 'Top 5', value: 5 }, { name: 'Top 10', value: 10 })
    ),
  new SlashCommandBuilder()
    .setName('competition')
    .setDescription('Manage the reaction competition')
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Start or restart a competition')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Competition name').setRequired(true)
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Limit tracking to this text channel')
        )
        .addStringOption(opt =>
          opt
            .setName('start_date')
            .setDescription('Optional start date/time (ISO). Date-only defaults to 00:01 Stockholm.')
        )
        .addStringOption(opt =>
          opt
            .setName('end_date')
            .setDescription('Optional end date/time (ISO). Date-only defaults to 23:59 Stockholm.')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Interactive setup for a competition')
    )
    .addSubcommand(sub =>
      sub
        .setName('end')
        .setDescription('End the current competition (keeps data for viewing)')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Show current competition settings')
    ),
  new SlashCommandBuilder()
    .setName('epic')
    .setDescription('Epic Games free game announcements')
    .addSubcommand(sub =>
      sub
        .setName('setchannel')
        .setDescription('Set the channel for Epic free game announcements')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Text channel to post announcements')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Show Epic free games announcement status')
    )
    .addSubcommand(sub =>
      sub
        .setName('check')
        .setDescription('Manually check Epic free games right now')
    ),
  new SlashCommandBuilder()
    .setName('wcl')
    .setDescription('Warcraft Logs tracking')
    .addSubcommand(sub =>
      sub
        .setName('scoreboard')
        .setDescription('Show standings (WCL only)')
    )
    .addSubcommand(sub =>
      sub
        .setName('teamruns')
        .setDescription('Show recent runs for a team')
        .addStringOption(opt =>
          opt
            .setName('team_name')
            .setDescription('Team name (optional)')
        )
        .addIntegerOption(opt =>
          opt
            .setName('limit')
            .setDescription('Number of rows (default 10)')
            .addChoices(
              { name: '5', value: 5 },
              { name: '10', value: 10 },
              { name: '25', value: 25 },
              { name: '50', value: 50 }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('forcecheck')
        .setDescription('Poll WCL now and announce new runs')
    )
    .addSubcommand(sub =>
      sub
        .setName('team')
        .setDescription('Create or update a team')
    )
    .addSubcommand(sub =>
      sub
        .setName('teamedit')
        .setDescription('Edit a team by name or number')
        .addStringOption(opt =>
          opt
            .setName('team_name')
            .setDescription('Team name')
        )
        .addIntegerOption(opt =>
          opt
            .setName('team_number')
            .setDescription('Team number')
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('listteams')
        .setDescription('List current teams and WCL link availability')
    )
    .addSubcommand(sub =>
      sub
        .setName('reloadteams')
        .setDescription('Reload teams data from disk')
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands', err);
  }
})();
