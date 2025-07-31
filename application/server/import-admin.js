#!/usr/bin/env node
/**
 * Import existing admin from Python script setup
 * This connects to the existing admin identity created by your Python script
 */

const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const https = require('https');
require('dotenv').config();

// Kaleido Configuration
const KALEIDO_CONFIG = {
  runtimeHostname: process.env.KALEIDO_RUNTIME_HOSTNAME,
  appCred: process.env.KALEIDO_APP_CRED,
  identityServiceHostname: process.env.KALEIDO_IDENTITY_SERVICE_HOSTNAME,
  channelName: process.env.KALEIDO_CHANNEL_NAME || 'default-channel',
  chaincodeName: process.env.KALEIDO_CHAINCODE_NAME || 'banana'
};

const KALEIDO_URLS = {
  query: `https://${KALEIDO_CONFIG.runtimeHostname}/query`
};

// Known admin from Python script
const PYTHON_ADMIN = {
  username: 'admin',
  password: 'admin123', // You can change this
  kid_name: 'admin_main_tester', // From Python script ID_ROSTER
  chaincode_alias: 'MainAdminFT' // From Python script ID_ROSTER
};

function makeKaleidoRequest(url, payload = null, method = 'POST') {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(KALEIDO_CONFIG.appCred).toString('base64');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`
    };

    const data = payload ? JSON.stringify(payload) : null;
    
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers,
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        const result = { status: res.statusCode };
        if (body) {
          try {
            Object.assign(result, JSON.parse(body));
          } catch (e) {
            result.raw = body;
          }
        }
        resolve(result);
      });
    });

    req.on('error', (err) => {
      resolve({ err: err.message, status: 500 });
    });

    req.setTimeout(90000, () => {
      req.destroy();
      resolve({ err: 'Request timeout', status: 408 });
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function queryChaincode(kidName, func, args) {
  const payload = {
    headers: {
      signer: kidName,
      channel: KALEIDO_CONFIG.channelName,
      chaincode: KALEIDO_CONFIG.chaincodeName
    },
    func: func,
    args: args.map(arg => String(arg))
  };

  const result = await makeKaleidoRequest(KALEIDO_URLS.query, payload);
  
  if (result.status === 200) {
    try {
      const parsed = result.result ? JSON.parse(result.result) : null;
      return { success: true, data: parsed };
    } catch (e) {
      return { success: true, data: result.result };
    }
  }

  return { success: false, error: result };
}

async function testAdminAccess(kidName, alias) {
  console.log(`🔍 Testing admin access for ${kidName} (${alias})`);
  
  try {
    // Test 1: Get own identity details
    const identityResult = await queryChaincode(kidName, 'GetIdentityDetails', [alias]);
    if (identityResult.success && identityResult.data?.isAdmin) {
      console.log('✅ Admin can access own identity details');
      console.log(`   FullID: ${identityResult.data.fullId}`);
      console.log(`   Roles: ${identityResult.data.roles?.join(', ') || 'none'}`);
    } else {
      console.log('❌ Admin cannot access own identity details');
      return false;
    }

    // Test 2: Try to get all identities (admin function)
    const allIdentitiesResult = await queryChaincode(kidName, 'GetAllIdentities', []);
    if (allIdentitiesResult.success && Array.isArray(allIdentitiesResult.data)) {
      console.log(`✅ Admin can list all identities (${allIdentitiesResult.data.length} found)`);
    } else {
      console.log('⚠️  Admin cannot list all identities (but might still work for other functions)');
    }

    // Test 3: Try to get all shipments
    const shipmentsResult = await queryChaincode(kidName, 'GetAllShipments', ['5', '']);
    if (shipmentsResult.success) {
      console.log('✅ Admin can access shipments');
    } else {
      console.log('⚠️  Admin cannot access shipments directly');
    }

    return true;
  } catch (error) {
    console.log('❌ Error testing admin access:', error.message);
    return false;
  }
}

async function importAdmin() {
  console.log('📥 Importing Existing Admin from Python Script Setup\n');

  try {
    // Step 1: Setup database
    console.log('Step 1: Setting up database...');
    const db = new sqlite3.Database('./foodtrace.db');
    
    // Create tables if they don't exist
    await new Promise((resolve, reject) => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        kid_name TEXT UNIQUE NOT NULL,
        chaincode_alias TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) reject(err);
        else {
          console.log('✓ Database ready');
          resolve();
        }
      });
    });

    // Step 2: Check if admin already exists
    console.log('\nStep 2: Checking for existing admin...');
    const existingAdmin = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE kid_name = ? OR chaincode_alias = ?', 
        [PYTHON_ADMIN.kid_name, PYTHON_ADMIN.chaincode_alias], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingAdmin) {
      console.log('✓ Admin already imported');
      console.log(`   Username: ${existingAdmin.username}`);
      console.log(`   Alias: ${existingAdmin.chaincode_alias}`);
      
      // Still test access
      const hasAccess = await testAdminAccess(existingAdmin.kid_name, existingAdmin.chaincode_alias);
      if (hasAccess) {
        console.log('\n🎉 Admin import verification successful!');
      } else {
        console.log('\n⚠️  Admin exists but has limited access. Check your chaincode state.');
      }
      
      db.close();
      return;
    }

    // Step 3: Test chaincode access with Python admin identity
    console.log('\nStep 3: Testing chaincode access...');
    const hasAccess = await testAdminAccess(PYTHON_ADMIN.kid_name, PYTHON_ADMIN.chaincode_alias);
    
    if (!hasAccess) {
      console.log('❌ Python admin identity cannot access chaincode.');
      console.log('This might mean:');
      console.log('   1. The Python script admin is not properly configured');
      console.log('   2. The chaincode state needs to be reset');
      console.log('   3. There are different admin identities in the system');
      db.close();
      process.exit(1);
    }

    // Step 4: Import the admin to local database
    console.log('\nStep 4: Importing admin to local database...');
    const hashedPassword = await bcrypt.hash(PYTHON_ADMIN.password, 10);

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, password, kid_name, chaincode_alias, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
        [PYTHON_ADMIN.username, hashedPassword, PYTHON_ADMIN.kid_name, PYTHON_ADMIN.chaincode_alias, 'admin', 1],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    console.log('✓ Admin imported to local database');
    db.close();

    console.log('\n🎉 Admin import completed successfully!');
    console.log('\nImported admin credentials:');
    console.log(`   Username: ${PYTHON_ADMIN.username}`);
    console.log(`   Password: ${PYTHON_ADMIN.password}`);
    console.log(`   Alias: ${PYTHON_ADMIN.chaincode_alias}`);
    console.log(`   Kid Name: ${PYTHON_ADMIN.kid_name}`);
    console.log('\n💡 You can now start the server and login with these credentials.');

  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log('Import Existing Admin Script\n');
  console.log('This script imports the admin identity created by your Python script.');
  console.log('It connects to the existing chaincode admin instead of creating a new one.\n');
  console.log('Usage: node import-admin.js [options]\n');
  console.log('Options:');
  console.log('  --help             Show this help message');
  process.exit(0);
}

// Check if required environment variables are set
function checkEnvironment() {
  const required = [
    'KALEIDO_RUNTIME_HOSTNAME',
    'KALEIDO_APP_CRED',
    'KALEIDO_IDENTITY_SERVICE_HOSTNAME'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   ${key}`));
    console.error('\nPlease check your .env file');
    process.exit(1);
  }
}

// Run import if called directly
if (require.main === module) {
  checkEnvironment();
  importAdmin().catch(error => {
    console.error('Import error:', error);
    process.exit(1);
  });
}

module.exports = { importAdmin, PYTHON_ADMIN };