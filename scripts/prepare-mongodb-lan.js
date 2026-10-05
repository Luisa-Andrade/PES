const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '..');
const secretsPath = path.join(root, '.mongo-lan-credentials.json');
const envPath = path.join(root, '.env');
const hostname = os.hostname();
const randomPassword = () => crypto.randomBytes(36).toString('base64url');

async function main() {
  if (!/^[A-Za-z0-9-]+$/.test(hostname)) throw new Error('Nome deste computador inválido.');
  if (fs.existsSync(secretsPath)) throw new Error('As credenciais da rede já foram preparadas.');
  await mongoose.connect('mongodb://127.0.0.1:27017/crisoneldb?directConnection=true', { serverSelectionTimeoutMS: 5000 });
  const adminDb = mongoose.connection.client.db('admin');
  const appDb = mongoose.connection.client.db('crisoneldb');
  const [adminUsers, appUsers] = await Promise.all([
    adminDb.command({ usersInfo: 1 }), appDb.command({ usersInfo: 1 })
  ]);
  if (adminUsers.users.length || appUsers.users.length) {
    throw new Error('Já existem usuários no MongoDB. Configure-os manualmente antes de executar este script.');
  }

  const credentials = {
    hostname,
    adminUser: 'farmavida_admin',
    adminPassword: randomPassword(),
    appUser: 'farmavida_app',
    appPassword: randomPassword()
  };
  fs.writeFileSync(secretsPath, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
  await adminDb.command({ createUser: credentials.adminUser, pwd: credentials.adminPassword,
    roles: [{ role: 'root', db: 'admin' }] });
  await appDb.command({ createUser: credentials.appUser, pwd: credentials.appPassword,
    roles: [{ role: 'readWrite', db: 'crisoneldb' }] });

  const uri = `mongodb://${credentials.appUser}:${credentials.appPassword}@${hostname}:27017/crisoneldb?replicaSet=rs0`;
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  env = env.replace(/^DB_LOCAL_URI=.*\r?\n?/gm, '').trimEnd();
  fs.writeFileSync(envPath, `${env}${env ? '\n' : ''}DB_LOCAL_URI=${uri}\n`, { mode: 0o600 });
  console.log(`Credenciais criadas. Endereço do servidor: ${hostname}. Arquivo local: ${secretsPath}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
