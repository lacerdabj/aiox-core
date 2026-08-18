/**
 * Preset Command Module
 *
 * Browse and inspect tech presets stored in .aiox-core/data/tech-presets/.
 * Subcommands: list, show.
 *
 * @module cli/commands/preset
 * @version 1.0.0
 * @story ORION-TR.1 — Foundation Tech Preset
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

const PRESETS_DIR = path.join(__dirname, '..', '..', '..', 'data', 'tech-presets');

/**
 * List all available tech presets (id + one-line description).
 */
function createListCommand() {
  return new Command('list')
    .description('List all available tech presets')
    .action(() => {
      try {
        if (!fs.existsSync(PRESETS_DIR)) {
          console.log('⚠️  No tech-presets directory found.');
          return;
        }

        const files = fs.readdirSync(PRESETS_DIR)
          .filter(f => f.endsWith('.md') && !f.startsWith('_'));

        if (files.length === 0) {
          console.log('ℹ️  No tech presets registered yet.');
          return;
        }

        console.log('📐 Tech Presets\n');

        for (const file of files.sort()) {
          const id = file.replace('.md', '');
          const content = fs.readFileSync(path.join(PRESETS_DIR, file), 'utf8');
          // Extract description from YAML metadata block
          const descMatch = content.match(/description:\s*['"]?(.+?)['"]?\s*$/m);
          const desc = descMatch ? descMatch[1].slice(0, 72) : '';
          console.log(`  ${id.padEnd(24)} ${desc}`);
        }

        console.log(`\n${files.length} preset(s) available.`);
        console.log('Usage: aiox preset show <preset-id>');
      } catch (error) {
        console.error(`❌ Error listing presets: ${error.message}`);
        process.exit(1);
      }
    });
}

/**
 * Show full details of a single tech preset.
 */
function createShowCommand() {
  return new Command('show')
    .description('Show a tech preset by id')
    .argument('<preset-id>', 'Preset identifier (folder name without .md)')
    .action((presetId) => {
      try {
        const filePath = path.join(PRESETS_DIR, `${presetId}.md`);

        if (!fs.existsSync(filePath)) {
          console.error(`❌ Preset not found: ${presetId}`);
          console.log(`Run "aiox preset list" to see available presets.`);
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        console.log(content);
      } catch (error) {
        console.error(`❌ Error reading preset: ${error.message}`);
        process.exit(1);
      }
    });
}

/**
 * Create the preset command with all subcommands.
 * @returns {Command} Commander command instance
 */
function createPresetCommand() {
  const preset = new Command('preset');

  preset
    .description('Browse and inspect tech presets (GSAP, Three.js, etc.)')
    .addHelpText('after', `
Commands:
  list              List all available presets with descriptions
  show <id>         Show full preset documentation

Examples:
  $ aiox preset list
  $ aiox preset show gsap-three-motion
  $ aiox preset show nextjs-react
`);

  preset.addCommand(createListCommand());
  preset.addCommand(createShowCommand());

  return preset;
}

module.exports = {
  createPresetCommand,
};
