const { execSync } = require('child_process');

try {
  console.log('Applying Prisma migrations...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
  });
  console.log('✅ Migration applied successfully!');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
