#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

if (process.env.WESPR_SETUP_BINARIES !== '1') {
  console.log('\n▶ postinstall');
  console.log('✓ Dépendances Node installées. Binaires ignorés en développement.');
  console.log('  Lancez `npm run setup:binaries` uniquement pour préparer le bundle local.');
  process.exit(0);
}

function run(name, script) {
  console.log(`\n▶ ${name}`);
  try {
    execSync(`bash "${path.join(__dirname, script)}"`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log(`✓ ${name} — OK`);
  } catch (e) {
    console.error(`✗ ${name} — ÉCHEC (code ${e.status})`);
    process.exit(1);
  }
}

run('ffmpeg statique', 'download-ffmpeg.sh');
run('yt-dlp', 'download-ytdlp.sh');
run('whisper-cli (compile)', 'build-whisper.sh');
