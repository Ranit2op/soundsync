const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDesktop = path.join(projectRoot, 'dist-desktop');

if (fs.existsSync(distDesktop)) {
  fs.rmSync(distDesktop, { force: true, recursive: true });
}

