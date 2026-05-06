// Inject NSMicrophoneUsageDescription into the renderer helper's Info.plist.
// Without this key, macOS silently denies getUserMedia from the helper process
// without showing a permission dialog (the helper has a distinct bundle ID from
// the main app and macOS checks the key on the *requesting* bundle).
// electron-builder calls this hook before signing, so the modification is covered
// by the final signature.

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const MIC_DESCRIPTION = "WeSpR a besoin du micro pour enregistrer votre voix. L'audio reste sur votre Mac.";

exports.default = async function afterPack(context) {
  if (context.packager.platform.name !== 'mac') return;

  const appName = context.packager.appInfo.productName;
  const helperPlist = path.join(
    context.appOutDir,
    `${appName}.app`,
    'Contents',
    'Frameworks',
    `${appName} Helper (Renderer).app`,
    'Contents',
    'Info.plist'
  );

  if (!fs.existsSync(helperPlist)) {
    console.warn(`afterPack: renderer helper plist not found at ${helperPlist}`);
    return;
  }

  try {
    execFileSync('plutil', ['-insert', 'NSMicrophoneUsageDescription', '-string', MIC_DESCRIPTION, helperPlist]);
  } catch {
    execFileSync('plutil', ['-replace', 'NSMicrophoneUsageDescription', '-string', MIC_DESCRIPTION, helperPlist]);
  }

  console.log('afterPack: NSMicrophoneUsageDescription added to renderer helper plist');
};
