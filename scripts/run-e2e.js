#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting Vite dev server on port 3002...');

// Start Vite dev server on port 3002
const vite = spawn('npm', ['run', 'dev', '--', '--port', '3002'], { 
  stdio: 'pipe',
  cwd: resolve(__dirname, '..')
});

let port = 3002;
let viteStarted = false;

vite.stderr.on('data', (data) => {
  const output = data.toString();
  console.log('Vite output:', output);
  
  // Look for the port in Vite's output (check for both http and https)
  const match = output.match(/Local:\s+(?:https?:\/\/)?localhost:(\d+)/);
  if (match && !viteStarted) {
    port = match[1];
    viteStarted = true;
    console.log(`\n🎯 Vite detected on port: ${port}`);
    console.log(`🚀 Starting Playwright tests with base URL: http://localhost:${port}\n`);
    
    // Kill Vite and start Playwright
    vite.kill();
    
    // Start Playwright with the detected port
    const playwright = spawn('npx', ['playwright', 'test'], {
      env: { 
        ...process.env, 
        PLAYWRIGHT_BASE_URL: `http://localhost:${port}` 
      },
      stdio: 'inherit',
      cwd: resolve(__dirname, '..')
    });
    
    playwright.on('close', (code) => {
      process.exit(code);
    });
  }
});

vite.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('Vite stdout:', output);
  
  // Also check stdout for port info (check for both http and https)
  const match = output.match(/Local:\s+(?:https?:\/\/)?localhost:(\d+)/);
  if (match && !viteStarted) {
    port = match[1];
    viteStarted = true;
    console.log(`\n🎯 Vite detected on port: ${port}`);
    console.log(`🚀 Starting Playwright tests with base URL: http://localhost:${port}\n`);
    
    // Kill Vite and start Playwright
    vite.kill();
    
    // Start Playwright with the detected port
    const playwright = spawn('npx', ['playwright', 'test'], {
      env: { 
        ...process.env, 
        PLAYWRIGHT_BASE_URL: `http://localhost:${port}` 
      },
      stdio: 'inherit',
      cwd: resolve(__dirname, '..')
    });
    
    playwright.on('close', (code) => {
      process.exit(code);
    });
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  if (!viteStarted) {
    console.error('❌ Timeout: Could not detect Vite port within 10 seconds');
    vite.kill();
    process.exit(1);
  }
}, 10000);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  vite.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, cleaning up...');
  vite.kill();
  process.exit(0);
});
