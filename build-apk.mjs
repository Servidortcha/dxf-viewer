import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Resolve bubblewrap cli and core from the global install
const cliRoot = 'C:/Users/Usuario/AppData/Roaming/npm/node_modules/@bubblewrap/cli';
const buildMod = require(path.join(cliRoot, 'dist/lib/cmds/build.js'));
const configMod = require(path.join(cliRoot, 'dist/lib/config.js'));
const coreMod = require(path.join(cliRoot, 'node_modules/@bubblewrap/core/dist/index.js'));

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectDir = path.join(__dirname, 'twa');
const manifestPath = path.join(projectDir, 'twa-manifest.json');

// A Prompt implementation that answers non-interactively.
class AutoPrompt {
  async printMessage(message) { console.log(message); }
  async promptConfirm(message, defaultValue) {
    // Use existing JDK / SDK instead of letting Bubblewrap install its own
    if (/JDK|SDK/i.test(message)) return false;
    return true; // updating the TWA project: yes
  }
  async promptPassword(message) { return process.env.BUBBLEWRAP_KEYSTORE_PASSWORD || 'android123'; }
  async promptInput(message, defaultValue) {
    if (/JDK/i.test(message)) return 'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.8-hotspot';
    if (/SDK/i.test(message)) return 'C:\\Android\\sdk';
    return typeof defaultValue === 'string' && defaultValue ? defaultValue : '1.0.1';
  }
  async promptChoice(message, choices, defaultValue) { return defaultValue !== undefined ? defaultValue : choices[0]; }
  async promptList(message, choices) { return choices[0]; }
  async prompt() { return ''; }
  async downloadFile() {}
  async createDir() {}
  async removeDir() {}
  async fileExists() { return false; }
  async promptKeystorePath() { return path.join(projectDir, 'android.keystore'); }
  async promptKeystoreInfo() {
    return { path: path.join(projectDir, 'android.keystore'), alias: 'android' };
  }
}

async function main() {
  const log = new coreMod.ConsoleLog('config');
  const prompt = new AutoPrompt();

  // Load or create config passing the auto prompt so it never asks interactively
  const config = await configMod.loadOrCreateConfig(log, prompt, undefined);

  const parsedArgs = {
    _: [],
    directory: projectDir,
    manifest: manifestPath,
    skipSigning: false,
    skipVersionUpgrade: true,
  };

  const buildLog = new coreMod.ConsoleLog('build');
  const ok = await buildMod.build(config, parsedArgs, buildLog, prompt);
  console.log('BUILD RESULT:', ok);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
