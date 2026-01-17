require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('wcl')
    .setDescription('Warcraft Logs tracking')
    .addSubcommand((sub) =>
      sub.setName('scoreboard').setDescription('Show standings')
    )
    .addSubcommand((sub) =>
      sub
        .setName('teamruns')
        .setDescription('Show recent runs for a team')
        .addStringOption((opt) =>
          opt.setName('team_name').setDescription('Team name (optional)')
        )
        .addIntegerOption((opt) =>
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
    .addSubcommand((sub) =>
      sub.setName('forcecheck').setDescription('Poll WCL now and announce new runs')
    )
    .addSubcommand((sub) =>
      sub.setName('team').setDescription('Create or update a team')
    )
    .addSubcommand((sub) =>
      sub
        .setName('teamedit')
        .setDescription('Edit a team by name or number')
        .addStringOption((opt) => opt.setName('team_name').setDescription('Team name'))
        .addIntegerOption((opt) => opt.setName('team_number').setDescription('Team number'))
    )
    .addSubcommand((sub) =>
      sub.setName('listteams').setDescription('List current teams and WCL link availability')
    )
    .addSubcommand((sub) =>
      sub.setName('reloadteams').setDescription('Reload teams data from disk')
    ),
].map((cmd) => cmd.toJSON());

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
