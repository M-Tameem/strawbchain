#!/usr/bin/env node
/**
 * Smart startup script for Foodtrace BFF Server
 * Checks if bootstrap is needed and runs it automatically
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const DB_PATH = './foodtrace.db';

async function checkEnvironment() {
  console.log('🔧 Checking environment configuration...');
  
  const required = [
    'KALEIDO_RUNTIME_HOSTNAME',
    'KALEIDO_APP_CRED',
    'KALEIDO_IDENTITY_SERVICE_HOSTNAME',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   ${key}`));
    console.error('\nPlease check your .env file');
    return false;
  }

  if (process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
    console.warn('⚠️  WARNING: Using default JWT_SECRET. Please change this in production!');
  }

  console.log('✅ Environment configuration looks good');
  return true;
}

async function checkDatabase() {
  console.log('🗄️  Checking database...');
  
  if (!fs.existsSync(DB_PATH)) {
    console.log('📝 Database file not found, will be created during bootstrap');
    return false;
  }

  return new Promise((resolve) => {
    const db = new sqlite3.Database(DB_PATH);
    
    db.get('SELECT COUNT(*) as count FROM users WHERE is_admin = 1', (err, row) => {
      if (err) {
        console.log('📝 Database exists but no admin users found');
        resolve(false);
      } else if (row.count === 0) {
        console.log('📝 Database exists but no admin users found');
        resolve(false);
      } else {
        console.log(`✅ Database ready with ${row.count} admin user(s)`);
        resolve(true);
      }
      db.close();
    });
  });
}

async function runBootstrap() {
  console.log('🚀 Running bootstrap process...');
  
  return new Promise((resolve, reject) => {
    const bootstrap = spawn('node', ['bootstrap.js'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    bootstrap.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Bootstrap completed successfully');
        resolve();
      } else {
        console.log(`❌ Bootstrap failed with exit code ${code}`);
        console.log('🔧 Trying to import existing admin instead...');
        runImportAdmin().then(resolve).catch(reject);
      }
    });

    bootstrap.on('error', (err) => {
      console.error('❌ Bootstrap process error:', err);
      console.log('🔧 Trying to import existing admin instead...');
      runImportAdmin().then(resolve).catch(reject);
    });
  });
}

async function runImportAdmin() {
  console.log('📥 Running import admin process...');
  
  return new Promise((resolve, reject) => {
    const importAdmin = spawn('node', ['import-admin.js'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    importAdmin.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Admin import completed successfully');
        resolve();
      } else {
        console.error(`❌ Admin import failed with exit code ${code}`);
        reject(new Error(`Admin import failed with exit code ${code}`));
      }
    });

    importAdmin.on('error', (err) => {
      console.error('❌ Admin import process error:', err);
      reject(err);
    });
  });
}

async function startServer() {
  console.log('🚀 Starting Foodtrace BFF Server...');
  
  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  server.on('error', (err) => {
    console.error('❌ Server start error:', err);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Gracefully shutting down server...');
    server.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Gracefully shutting down server...');
    server.kill('SIGTERM');
  });
}

async function main() {
  console.log('🎯 Foodtrace BFF Server Startup');
  console.log('================================\n');

  try {
    // Step 1: Check environment
    const envOk = await checkEnvironment();
    if (!envOk) {
      process.exit(1);
    }

    // Step 2: Check if bootstrap is needed
    const dbReady = await checkDatabase();
    
    if (!dbReady) {
      console.log('\n🔧 Bootstrap required...');
      await runBootstrap();
    }

    // Step 3: Start the server
    console.log('\n🎉 System ready! Starting server...');
    await startServer();

  } catch (error) {
    console.error('\n❌ Startup failed:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--force-bootstrap')) {
  console.log('🔧 Force bootstrap requested...');
  runBootstrap().then(() => {
    console.log('🎉 Force bootstrap completed');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Force bootstrap failed:', err);
    process.exit(1);
  });
} else if (args.includes('--import-admin')) {
  console.log('📥 Import admin requested...');
  runImportAdmin().then(() => {
    console.log('🎉 Admin import completed');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Admin import failed:', err);
    process.exit(1);
  });
} else if (args.includes('--check-only')) {
  console.log('🔍 Running checks only...');
  Promise.all([checkEnvironment(), checkDatabase()]).then(([envOk, dbReady]) => {
    console.log('\n📊 Check Results:');
    console.log(`   Environment: ${envOk ? '✅ OK' : '❌ Issues'}`);
    console.log(`   Database: ${dbReady ? '✅ Ready' : '⚠️  Needs Bootstrap'}`);
    process.exit(envOk && dbReady ? 0 : 1);
  });
} else if (args.includes('--help')) {
  console.log('Foodtrace BFF Server Startup Script\n');
  console.log('Usage: node start.js [options]\n');
  console.log('Options:');
  console.log('  --force-bootstrap  Force run bootstrap even if not needed');
  console.log('  --import-admin     Import existing admin from Python script setup');
  console.log('  --check-only       Run environment and database checks only');
  console.log('  --help             Show this help message');
  process.exit(0);
} else {
  main();
}