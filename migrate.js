#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const workdir = process.cwd();
console.log('Working directory:', workdir);

// Run: npx prisma migrate deploy
const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: workdir,
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Migration applied successfully!');
  } else {
    console.log('\n❌ Migration failed with code', code);
  }
  process.exit(code);
});

child.on('error', (err) => {
  console.error('Error running migration:', err);
  process.exit(1);
});
