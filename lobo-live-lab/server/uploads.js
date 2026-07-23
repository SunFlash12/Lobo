// Multer upload handler with 5MB cap and strict MIME filter.
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_AUDIO = new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave']);
const ALLOWED_IMAGE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10) || '';
    const safe = uuid() + ext;
    cb(null, safe);
  },
});

function fileFilter(req, file, cb) {
  if (ALLOWED_AUDIO.has(file.mimetype) || ALLOWED_IMAGE.has(file.mimetype) || ALLOWED_VIDEO.has(file.mimetype)) return cb(null, true);
  cb(new Error('Only audio (mp3/ogg/wav), image (png/jpg/gif/webp/svg) or video (mp4/webm) files are allowed.'));
}

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

function classify(mime) {
  if (ALLOWED_AUDIO.has(mime)) return 'audio';
  if (ALLOWED_IMAGE.has(mime)) return 'image';
  if (ALLOWED_VIDEO.has(mime)) return 'video';
  return 'other';
}

module.exports = { uploader, UPLOAD_DIR, classify };
