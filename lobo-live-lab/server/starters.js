// Starter-image importer: on boot, copy any file from assets/starter-images/
// into data/uploads/ and register it in the uploads store, IF it hasn't been
// registered yet. Idempotent — safe to run every launch.
//
// This is how the "New Fan!" / "Choked!" / full-body Lobo pose art ships out
// of the box, so a fresh install already has usable alert imagery.
const fs = require('fs');
const path = require('path');
const db = require('./db');

const STARTER_DIR = path.join(__dirname, '..', 'assets', 'starter-images');
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');

const EXT_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function importStarters() {
  if (!fs.existsSync(STARTER_DIR)) return;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const existing = new Set(db.listUploads().map(u => u.id));
  let imported = 0;

  for (const entry of fs.readdirSync(STARTER_DIR)) {
    const ext = path.extname(entry).toLowerCase();
    const mime = EXT_MIME[ext];
    if (!mime) continue;
    const id = path.parse(entry).name;              // e.g. "starter-new-fan"
    if (existing.has(id)) continue;                 // already imported
    const dest = path.join(UPLOAD_DIR, entry);
    try {
      fs.copyFileSync(path.join(STARTER_DIR, entry), dest);
      const stat = fs.statSync(dest);
      db.registerUpload({
        id,
        filename: entry,
        mime,
        size: stat.size,
        kind: 'image',
      });
      imported += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[starters] could not import ${entry}:`, e && e.message);
    }
  }

  if (imported > 0) console.log(`  Starter images imported: ${imported}`);
}

module.exports = { importStarters };
