#!/usr/bin/env node
const { execSync } = require('child_process');

const commands = [
  { name: 'Generate Prisma Client', cmd: 'npx prisma generate' },
  { name: 'Deploy migrations', cmd: 'npx prisma migrate deploy' }
];

for (const { name, cmd } of commands) {
  try {
    console.log(`\n📦 ${name}...`);
    execSync(cmd, { stdio: 'inherit' });
    console.log(`✅ ${name} completed`);
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
    if (name === 'Generate Prisma Client') {
      console.log('Continuing despite error...\n');
      continue;
    }
    process.exit(1);
  }
}

console.log('\n✅ All done!');
