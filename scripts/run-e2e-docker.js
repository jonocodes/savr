#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Check if Docker is running
function isDockerRunning() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check if Playwright container is already running
function isPlaywrightContainerRunning() {
  try {
    const output = execSync('docker ps --filter "ancestor=mcr.microsoft.com/playwright:v1.54.0-jammy" --format "{{.ID}}"', { encoding: 'utf-8' });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

// Start the Playwright Docker container
function startPlaywrightContainer() {
  console.log('🐳 Starting Playwright Docker container...');
  try {
    execSync('docker compose -f docker-compose.playwright.yml up -d', {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    // Wait for container to be ready
    console.log('⏳ Waiting for Playwright server to be ready...');
    let retries = 30;
    while (retries > 0) {
      try {
        execSync('curl -s http://localhost:3001 > /dev/null 2>&1', { timeout: 1000 });
        console.log('✅ Playwright server is ready');
        return true;
      } catch {
        retries--;
        if (retries > 0) {
          execSync('sleep 1');
        }
      }
    }
    console.error('❌ Playwright server failed to start');
    return false;
  } catch (error) {
    console.error('❌ Failed to start Playwright container:', error.message);
    return false;
  }
}

// Stop the Playwright Docker container
function stopPlaywrightContainer() {
  console.log('\n🛑 Stopping Playwright Docker container...');
  try {
    execSync('docker compose -f docker-compose.playwright.yml down', {
      cwd: projectRoot,
      stdio: 'inherit'
    });
  } catch (error) {
    console.warn('⚠️  Failed to stop Playwright container:', error.message);
  }
}

async function main() {
  // Check Docker is running
  if (!isDockerRunning()) {
    console.error('❌ Docker is not running. Please start Docker first.');
    process.exit(1);
  }

  const containerWasRunning = isPlaywrightContainerRunning();
  let weStartedContainer = false;

  // Start container if not running
  if (!containerWasRunning) {
    if (!startPlaywrightContainer()) {
      process.exit(1);
    }
    weStartedContainer = true;
  } else {
    console.log('✅ Playwright Docker container is already running');
  }

  // Run the e2e tests
  console.log('\n🚀 Running e2e tests with Docker browser...\n');

  // Pass through any additional arguments (like --grep)
  const args = process.argv.slice(2);

  const testProcess = spawn('node', ['scripts/run-e2e.js', ...args], {
    env: {
      ...process.env,
      PW_SERVER: 'ws://localhost:3001'
    },
    stdio: 'inherit',
    cwd: projectRoot
  });

  testProcess.on('close', (code) => {
    // Only stop container if we started it
    if (weStartedContainer) {
      stopPlaywrightContainer();
    }
    process.exit(code);
  });

  // Handle interrupts
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, cleaning up...');
    testProcess.kill('SIGINT');
    if (weStartedContainer) {
      stopPlaywrightContainer();
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, cleaning up...');
    testProcess.kill('SIGTERM');
    if (weStartedContainer) {
      stopPlaywrightContainer();
    }
    process.exit(0);
  });
}

main();
