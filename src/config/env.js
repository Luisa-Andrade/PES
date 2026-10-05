require('../utils/loadEnv')();

module.exports = {
  DB_LOCAL_URI: process.env.DB_LOCAL_URI || 'mongodb://127.0.0.1:27017/crisoneldb',
  DB_ATLAS_URI: process.env.DB_ATLAS_URI || '',
  MONGO_OPTIONS: { serverSelectionTimeoutMS: 8000 },
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || '20211206',
  DEFAULT_USER_PASSWORD: process.env.DEFAULT_USER_PASSWORD || '20211206',
  PDF_SAVE_PATH: process.env.PDF_SAVE_PATH || ''
};
