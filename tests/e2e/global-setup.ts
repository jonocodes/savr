import { spawn, ChildProcess } from 'child_process';
import { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

let armadettoProcess: ChildProcess | null = null;
let contentServerProcess: ChildProcess | null = null;

export default async function globalSetup(config: FullConfig) {
  console.log('\n🚀 Starting test servers...\n');

  // Start Armadietto RemoteStorage server
  console.log('Starting Armadietto RemoteStorage server...');
  armadettoProcess = spawn('flox', ['activate', '--', 'node', 'armadietto.cjs'], {
    cwd: path.join(process.cwd(), 'test-server'),
    stdio: 'pipe'
  });

  // Capture token from stdout
  let token = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Armadietto server failed to start within 30 seconds'));
    }, 30000);

    armadettoProcess!.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log('[Armadietto]', output.trim());

      // Parse token: "Token:      <token>"
      const tokenMatch = output.match(/Token:\s+(.+)/);
      if (tokenMatch) {
        token = tokenMatch[1].trim();
        console.log('✅ Captured OAuth token');
      }

      if (output.includes('RemoteStorage Test Server Running')) {
        clearTimeout(timeout);
        console.log('✅ Armadietto server ready on port 8004\n');
        resolve(true);
      }
    });

    armadettoProcess!.stderr?.on('data', (data) => {
      console.error('[Armadietto Error]', data.toString());
    });

    armadettoProcess!.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Armadietto process error: ${err.message}`));
    });

    armadettoProcess!.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Armadietto exited with code ${code}`));
      }
    });
  });

  // Start content server for test data
  console.log('Starting content server...');
  contentServerProcess = spawn('npx', ['http-server', '-p', '8080', '--cors'], {
    cwd: path.join(process.cwd(), 'test_data'),
    stdio: 'pipe'
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Content server failed to start within 15 seconds'));
    }, 15000);

    contentServerProcess!.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log('[ContentServer]', output.trim());

      if (output.includes('Available on:')) {
        clearTimeout(timeout);
        console.log('✅ Content server ready on port 8080\n');
        resolve(true);
      }
    });

    contentServerProcess!.stderr?.on('data', (data) => {
      console.error('[ContentServer Error]', data.toString());
    });

    contentServerProcess!.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Content server process error: ${err.message}`));
    });

    contentServerProcess!.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Content server exited with code ${code}`));
      }
    });
  });

  // Store token for tests
  const testEnv = { RS_TOKEN: token };
  const testEnvPath = path.join(process.cwd(), 'tests/e2e/.test-env.json');
  fs.writeFileSync(testEnvPath, JSON.stringify(testEnv, null, 2));
  console.log('✅ Test environment saved\n');
  console.log('🎬 All servers ready! Starting tests...\n');

  // Return teardown function
  return async () => {
    console.log('\n🧹 Cleaning up test servers...\n');

    if (armadettoProcess) {
      console.log('Stopping Armadietto server...');
      armadettoProcess.kill('SIGTERM');
      // Give it a moment to clean up
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Force kill if still running
      if (!armadettoProcess.killed) {
        armadettoProcess.kill('SIGKILL');
      }
      console.log('✅ Armadietto server stopped');
    }

    if (contentServerProcess) {
      console.log('Stopping content server...');
      contentServerProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!contentServerProcess.killed) {
        contentServerProcess.kill('SIGKILL');
      }
      console.log('✅ Content server stopped');
    }

    console.log('✅ Cleanup complete\n');
  };
}
