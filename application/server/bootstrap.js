// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

/**
 * Bootstrap script for Foodtrace system
 * Sets up the initial admin user and bootstraps the chaincode
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
  identity: `https://${KALEIDO_CONFIG.identityServiceHostname}/identities`,
  transactions: `https://${KALEIDO_CONFIG.runtimeHostname}/transactions`,
  query: `https://${KALEIDO_CONFIG.runtimeHostname}/query`
};

// Default admin configuration
const ADMIN_CONFIG = {
  username: 'admin1',
  password: 'admin1234', // Change this!
  kid_name: 'admin_main_bootstraper',
  chaincode_alias: 'MainAdminFT'
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

async function registerKaleidoIdentity(kidName) {
  console.log(`Registering Kaleido identity: ${kidName}`);
  const result = await makeKaleidoRequest(KALEIDO_URLS.identity, {
    name: kidName,
    type: 'client'
  });

  if (result.secret) {
    console.log(`✓ Kaleido identity ${kidName} registered successfully`);
    return { success: true, secret: result.secret };
  }

  if (result.status === 500 && result.details?.error?.includes('already registered')) {
    console.log(`✓ Kaleido identity ${kidName} already exists`);
    return { success: true, exists: true };
  }

  console.error(`✗ Failed to register Kaleido identity ${kidName}:`, result);
  return { success: false, error: result };
}

async function enrollKaleidoIdentity(kidName, secret) {
  if (!secret) {
    const checkResult = await makeKaleidoRequest(`${KALEIDO_URLS.identity}/${kidName}`, null, 'GET');
    if (checkResult.status === 200 && checkResult.enrollmentCert) {
      console.log(`✓ Kaleido identity ${kidName} already enrolled`);
      return { success: true };
    }
    return { success: false, error: 'No secret available for enrollment' };
  }

  console.log(`Enrolling Kaleido identity: ${kidName}`);
  const result = await makeKaleidoRequest(`${KALEIDO_URLS.identity}/${kidName}/enroll`, {
    secret: secret
  });

  if (result.status === 200 || result.status === 201) {
    console.log(`✓ Kaleido identity ${kidName} enrolled successfully`);
    return { success: true };
  }

  console.error(`✗ Failed to enroll Kaleido identity ${kidName}:`, result);
  return { success: false, error: result };
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

async function invokeChaincode(kidName, func, args) {
  const payload = {
    headers: {
      signer: kidName,
      channel: KALEIDO_CONFIG.channelName,
      chaincode: KALEIDO_CONFIG.chaincodeName
    },
    func: func,
    args: args.map(arg => String(arg)),
    strongread: true
  };

  const result = await makeKaleidoRequest(KALEIDO_URLS.transactions, payload);
  return result;
}

function isCallSuccessful(result) {
  if (typeof result.status === 'string' && result.status.toUpperCase() === 'VALID') {
    return true;
  }
  if (result.status === 202 || result.status === 200) {
    return true;
  }
  return false;
}

async function setupDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database('./foodtrace.db');
    
    db.serialize(() => {
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
        if (err) {
          console.error('Database setup error:', err);
          reject(err);
        } else {
          console.log('✓ Database initialized');
          resolve(db);
        }
      });
    });
  });
}

async function bootstrap() {
  console.log('🚀 Starting Foodtrace Bootstrap Process\n');

  try {
    // Step 1: Setup database
    console.log('Step 1: Setting up database...');
    const db = await setupDatabase();

    // Check if admin already exists
    const existingAdmin = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingAdmin) {
      console.log('✓ Admin user already exists. Bootstrap not needed.');
      console.log(`   Admin: ${existingAdmin.username} (${existingAdmin.chaincode_alias})`);
      
      // Test if the existing admin can access the chaincode
      console.log('🔍 Testing existing admin access...');
      try {
        const testResult = await queryChaincode(existingAdmin.kid_name, 'GetIdentityDetails', [existingAdmin.chaincode_alias]);
        if (testResult.success && testResult.data?.isAdmin) {
          console.log('✅ Existing admin has proper chaincode access');
          db.close();
          return;
        } else {
          console.log('⚠️  Existing admin lacks chaincode access, continuing with bootstrap...');
        }
      } catch (error) {
        console.log('⚠️  Could not verify existing admin access, continuing with bootstrap...');
      }
    }

    // Step 2: Register and enroll Kaleido identity
    console.log('\nStep 2: Setting up Kaleido identity...');
    const registerResult = await registerKaleidoIdentity(ADMIN_CONFIG.kid_name);
    if (!registerResult.success) {
      throw new Error(`Failed to register Kaleido identity: ${JSON.stringify(registerResult.error)}`);
    }

    const enrollResult = await enrollKaleidoIdentity(ADMIN_CONFIG.kid_name, registerResult.secret);
    if (!enrollResult.success) {
      throw new Error(`Failed to enroll Kaleido identity: ${JSON.stringify(enrollResult.error)}`);
    }

    // Step 3: Get actual FullID
    console.log('\nStep 3: Getting actual FullID from chaincode...');
    const fullIdResult = await queryChaincode(ADMIN_CONFIG.kid_name, 'TestGetCallerIdentity', []);
    if (!fullIdResult.success || !fullIdResult.data?.fullId) {
      throw new Error('Failed to get FullID from chaincode');
    }

    const actualFullId = fullIdResult.data.fullId;
    console.log(`✓ Retrieved FullID: ${actualFullId}`);

    // Step 4: Pre-register admin identity with chaincode
    console.log('\nStep 4: Pre-registering admin with chaincode...');
    const preRegResult = await invokeChaincode(ADMIN_CONFIG.kid_name, 'RegisterIdentity', [
      actualFullId, ADMIN_CONFIG.chaincode_alias, ADMIN_CONFIG.chaincode_alias
    ]);

    if (!isCallSuccessful(preRegResult)) {
      const errorMsg = preRegResult.details?.error || '';
      if (!errorMsg.includes('already in use by identity')) {
        console.warn('Pre-registration warning:', preRegResult);
      }
    } else {
      console.log('✓ Admin pre-registered with chaincode');
    }

    // Step 5: Bootstrap the ledger
    console.log('\nStep 5: Bootstrapping the ledger...');
    const bootstrapResult = await invokeChaincode(ADMIN_CONFIG.kid_name, 'BootstrapLedger', []);
    
    if (!isCallSuccessful(bootstrapResult)) {
      const errorMsg = bootstrapResult.details?.error || '';
      if (errorMsg.includes('system already has admins or is bootstrapped')) {
        console.log('✓ Ledger already bootstrapped');
      } else {
        console.warn('Bootstrap warning:', bootstrapResult);
      }
    } else {
      console.log('✓ Ledger bootstrapped successfully');
    }

    // Step 6: Save admin to local database
    console.log('\nStep 6: Saving admin to local database...');
    const hashedPassword = await bcrypt.hash(ADMIN_CONFIG.password, 10);

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, password, kid_name, chaincode_alias, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
        [ADMIN_CONFIG.username, hashedPassword, ADMIN_CONFIG.kid_name, ADMIN_CONFIG.chaincode_alias, 'admin', 1],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    console.log('✓ Admin saved to local database');

    // Step 7: Verify setup
    console.log('\nStep 7: Verifying setup...');
    const verifyResult = await queryChaincode(ADMIN_CONFIG.kid_name, 'GetIdentityDetails', [ADMIN_CONFIG.chaincode_alias]);
    
    if (verifyResult.success && verifyResult.data?.isAdmin) {
      console.log('✓ Setup verification successful');
      console.log(`   Admin alias: ${verifyResult.data.shortName}`);
      console.log(`   Is admin: ${verifyResult.data.isAdmin}`);
      console.log(`   Roles: ${verifyResult.data.roles?.join(', ') || 'none'}`);
    } else {
      console.warn('⚠️  Setup verification warning:', verifyResult);
    }

    db.close();

    console.log('\n🎉 Bootstrap completed successfully!');
    console.log('\nDefault admin credentials:');
    console.log(`   Username: ${ADMIN_CONFIG.username}`);
    console.log(`   Password: ${ADMIN_CONFIG.password}`);
    console.log(`   Alias: ${ADMIN_CONFIG.chaincode_alias}`);
    console.log('\n⚠️  Please change the default password after first login!');

  } catch (error) {
    console.error('\n❌ Bootstrap failed:', error.message);
    process.exit(1);
  }
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

// Run bootstrap if called directly
if (require.main === module) {
  checkEnvironment();
  bootstrap().catch(error => {
    console.error('Bootstrap error:', error);
    process.exit(1);
  });
}

module.exports = { bootstrap, ADMIN_CONFIG };