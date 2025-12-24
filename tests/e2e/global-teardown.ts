import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  console.log('\n🧹 Running global teardown...\n');

  // Clean up temp storage directory
  const storagePath = '/tmp/restore';
  if (fs.existsSync(storagePath)) {
    console.log('Cleaning up RemoteStorage temp data...');
    try {
      fs.rmSync(storagePath, { recursive: true, force: true });
      console.log('✅ RemoteStorage temp data cleaned');
    } catch (error) {
      console.warn('⚠️  Failed to clean temp storage:', error);
    }
  }

  // Clean up test env file
  const testEnvPath = path.join(process.cwd(), 'tests/e2e/.test-env.json');
  if (fs.existsSync(testEnvPath)) {
    console.log('Cleaning up test environment file...');
    try {
      fs.unlinkSync(testEnvPath);
      console.log('✅ Test environment file removed');
    } catch (error) {
      console.warn('⚠️  Failed to remove test env file:', error);
    }
  }

  console.log('✅ Global teardown complete\n');
}
