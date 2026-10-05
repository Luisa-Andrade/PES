const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function main() {
  const root = path.resolve(__dirname, '..');
  const credentials = JSON.parse(fs.readFileSync(path.join(root, '.mongo-lan-credentials.json'), 'utf8'));
  const uri = `mongodb://${credentials.adminUser}:${credentials.adminPassword}@127.0.0.1:27017/admin?directConnection=true`;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const admin = mongoose.connection.db.admin();
  const current = await admin.command({ replSetGetConfig: 1 });
  const targetHost = `${credentials.hostname}:27017`;
  if (current.config.members.length !== 1) throw new Error('Esperado um único membro no replica set.');
  if (current.config.members[0].host !== targetHost) {
    current.config.members[0].host = targetHost;
    current.config.version += 1;
    await admin.command({ replSetReconfig: current.config });
  }
  await mongoose.disconnect();
  const appUri = `mongodb://${credentials.appUser}:${credentials.appPassword}@${credentials.hostname}:27017/crisoneldb?replicaSet=rs0`;
  await mongoose.connect(appUri, { serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.db.command({ ping: 1 });
  console.log(`Conexão autenticada e replica set prontos em ${credentials.hostname}:27017.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
