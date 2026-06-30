const sharp = require('sharp');
const fs = require('fs');

const svg = fs.readFileSync('icon-jla.svg');

const targets = [
  { size: 192, dest: 'public/img/icon-192.png' },
  { size: 512, dest: 'public/img/icon-512.png' },
  { size: 192, dest: 'public-admin/img/icon-192.png' },
  { size: 512, dest: 'public-admin/img/icon-512.png' },
];

Promise.all(
  targets.map(({ size, dest }) =>
    sharp(svg)
      .resize(size, size)
      .png()
      .toFile(dest)
      .then(() => console.log(`✅ ${dest}`))
      .catch((e) => console.error(`❌ ${dest}:`, e.message))
  )
).then(() => console.log('\nIconos generados.'));
