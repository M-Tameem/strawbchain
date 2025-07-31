const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const https = require('https');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const QRCode = require('qrcode');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:8080', 'http://localhost:3001'], // include all frontend origins
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight OPTIONS requests

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
const upload = multer({ storage: multer.memoryStorage() });

// Database setup
const db = new sqlite3.Database('./foodtrace.db');

// Initialize database
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
  )`);
});

// Kaleido Configuration
const KALEIDO_CONFIG = {
  runtimeHostname: process.env.KALEIDO_RUNTIME_HOSTNAME,
  appCred: process.env.KALEIDO_APP_CRED,
  identityServiceHostname: process.env.KALEIDO_IDENTITY_SERVICE_HOSTNAME,
  channelName: process.env.KALEIDO_CHANNEL_NAME || 'default-channel',
  chaincodeName: process.env.KALEIDO_CHAINCODE_NAME || 'banana'
};

const IPFS_CONFIG = {
  apiUrlBase: process.env.KALEIDO_IPFS_API_URL_BASE,
  appCred: process.env.KALEIDO_IPFS_APP_CRED
};

const KALEIDO_URLS = {
  apiGateway: `https://${KALEIDO_CONFIG.runtimeHostname}`,
  identity: `https://${KALEIDO_CONFIG.identityServiceHostname}/identities`,
  transactions: `https://${KALEIDO_CONFIG.runtimeHostname}/transactions`,
  query: `https://${KALEIDO_CONFIG.runtimeHostname}/query`
};

const PUBLIC_SHIPMENT_BASE_URL = process.env.PUBLIC_SHIPMENT_BASE_URL ||
  `http://localhost:${PORT}/api/shipments/public`;

// Kaleido HTTP Request Helper (replicating Python _req function)
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
      rejectUnauthorized: false // Matches Python SSL context
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
            Object.assign(result, JSON.parse(body.toString()));
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

// Kaleido Identity Management
async function registerKaleidoIdentity(kidName) {
  console.log(`Attempting to register Kaleido identity: ${kidName}`);
  const result = await makeKaleidoRequest(KALEIDO_URLS.identity, {
    name: kidName,
    type: 'client'
  });

  if (result.secret) {
    console.log(`Kaleido identity ${kidName} registered successfully`);
    return { success: true, secret: result.secret };
  }

  if (result.status === 500 && result.details?.error?.includes('already registered')) {
    console.log(`Kaleido identity ${kidName} already exists`);
    const checkResult = await makeKaleidoRequest(`${KALEIDO_URLS.identity}/${kidName}`, null, 'GET');
    if (checkResult.status === 200) {
      return { success: true, exists: true };
    }
  }

  console.error(`Failed to register Kaleido identity ${kidName}:`, result);
  return { success: false, error: result };
}

async function enrollKaleidoIdentity(kidName, secret) {
  if (!secret) {
    // Check if already enrolled
    const checkResult = await makeKaleidoRequest(`${KALEIDO_URLS.identity}/${kidName}`, null, 'GET');
    if (checkResult.status === 200 && checkResult.enrollmentCert) {
      console.log(`Kaleido identity ${kidName} already enrolled`);
      return { success: true };
    }
    return { success: false, error: 'No secret available for enrollment' };
  }

  console.log(`Attempting to enroll Kaleido identity: ${kidName}`);
  const result = await makeKaleidoRequest(`${KALEIDO_URLS.identity}/${kidName}/enroll`, {
    secret: secret
  });

  if (result.status === 200 || result.status === 201) {
    console.log(`Kaleido identity ${kidName} enrolled successfully`);
    return { success: true };
  }

  console.error(`Failed to enroll Kaleido identity ${kidName}:`, result);
  return { success: false, error: result };
}

// Chaincode Interaction
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
  console.log(`TX '${func}' by ${kidName}:`, result.status, result.transactionID || result.details?.error);
  return result;
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

  console.error(`Query '${func}' by ${kidName} failed:`, result);
  return { success: false, error: result };
}

// Utility function to ensure proper response structure for shipment queries
function normalizeShipmentResponse(data) {
  if (!data) {
    return { shipments: [], fetchedCount: 0, nextBookmark: '' };
  }
  
  if (data.shipments === null || data.shipments === undefined) {
    data.shipments = [];
  }
  
  return data;
}

// Utility function to check if chaincode call was successful
function isCallSuccessful(result) {
  if (typeof result.status === 'string' && result.status.toUpperCase() === 'VALID') {
    return true;
  }
  if (result.status === 202 || result.status === 200) {
    return true;
  }
  return false;
}

// Input validation helper
function validateRequired(fields, body) {
  const missing = fields.filter(field => !body[field]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

// Async error wrapper
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Allow guest access for certain endpoints
    if (req.path.startsWith('/api/shipments/public') || req.path === '/api/shipments/all') {
      return next();
    }
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Role-based authorization middleware
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role) && !req.user.is_admin) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

// Admin only middleware
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth Routes
app.post('/api/auth/register', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { username, password, chaincode_alias, role } = req.body;
  
  validateRequired(['username', 'password', 'chaincode_alias', 'role'], req.body);

  // Validate role
  const validRoles = ['farmer', 'processor', 'distributor', 'retailer', 'certifier', 'admin'];
  if (!validRoles.includes(role.toLowerCase())) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  // Generate kid_name
  const kid_name = `${username}_${Date.now()}`;

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Step 1: Register with Kaleido
  const registerResult = await registerKaleidoIdentity(kid_name);
  if (!registerResult.success) {
    return res.status(500).json({ error: 'Failed to register with Kaleido', details: registerResult.error });
  }

  // Step 2: Enroll with Kaleido
  const enrollResult = await enrollKaleidoIdentity(kid_name, registerResult.secret);
  if (!enrollResult.success) {
    return res.status(500).json({ error: 'Failed to enroll with Kaleido', details: enrollResult.error });
  }

  // Step 3: Get actual FullID from chaincode
  const fullIdResult = await queryChaincode(kid_name, 'TestGetCallerIdentity', []);
  if (!fullIdResult.success || !fullIdResult.data?.fullId) {
    return res.status(500).json({ error: 'Failed to get FullID from chaincode' });
  }

  const actualFullId = fullIdResult.data.fullId;

  // Step 4: Register identity with chaincode (as admin)
  const adminUser = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!adminUser) {
    return res.status(500).json({ error: 'No admin user found for chaincode registration' });
  }

  const registerChainResult = await invokeChaincode(
    adminUser.kid_name,
    'RegisterIdentity',
    [actualFullId, chaincode_alias, chaincode_alias]
  );

  if (!isCallSuccessful(registerChainResult)) {
    // Check if already registered
    const errorMsg = registerChainResult.details?.error || '';
    if (!errorMsg.includes('already in use by identity')) {
      return res.status(500).json({ error: 'Failed to register with chaincode', details: registerChainResult });
    }
  }

  // Step 5: Assign role (if not admin)
  if (role.toLowerCase() !== 'admin') {
    const roleResult = await invokeChaincode(
      adminUser.kid_name,
      'AssignRoleToIdentity',
      [chaincode_alias, role]
    );

    if (!isCallSuccessful(roleResult)) {
      console.warn(`Failed to assign role ${role} to ${chaincode_alias}:`, roleResult);
    }
  } else {
    // Make admin
    const adminResult = await invokeChaincode(
      adminUser.kid_name,
      'MakeIdentityAdmin',
      [chaincode_alias]
    );

    if (!isCallSuccessful(adminResult)) {
      console.warn(`Failed to make ${chaincode_alias} admin:`, adminResult);
    }
  }

  // Step 6: Save to local database
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (username, password, kid_name, chaincode_alias, role, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hashedPassword, kid_name, chaincode_alias, role, role.toLowerCase() === 'admin' ? 1 : 0],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });

  res.json({ 
    message: 'User registered successfully',
    user: {
      username,
      chaincode_alias,
      role,
      is_admin: role.toLowerCase() === 'admin'
    }
  });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  validateRequired(['username', 'password'], req.body);

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const userFromDb = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        // It's better to log the actual error on the server and send a generic message
        console.error('Database error during login:', err.message);
        return reject(new Error('Error fetching user data.'));
      }
      resolve(row);
    });
  });

  if (!userFromDb) {
    return res.status(401).json({ error: 'Invalid credentials - User not found' });
  }

  const passwordIsValid = await bcrypt.compare(password, userFromDb.password);
  if (!passwordIsValid) {
    return res.status(401).json({ error: 'Invalid credentials - Password incorrect' });
  }

  // User is authenticated, create JWT and prepare response
  const tokenPayload = {
    id: userFromDb.id,
    username: userFromDb.username,
    kid_name: userFromDb.kid_name, // Ensure this column exists and is populated in your 'users' table
    chaincode_alias: userFromDb.chaincode_alias,
    role: userFromDb.role,
    is_admin: !!userFromDb.is_admin // Ensure is_admin is a boolean (true/false)
  };

  const token = jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET, // Ensure JWT_SECRET is set in your .env file
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: {
      username: userFromDb.username,
      chaincode_alias: userFromDb.chaincode_alias,
      role: userFromDb.role,
      is_admin: !!userFromDb.is_admin, // Consistent boolean for the client
      kid_name: userFromDb.kid_name    // <<< This is the crucial addition
    }
  });
}));

// Identity Management Routes
app.get('/api/identities', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await queryChaincode(req.user.kid_name, 'GetAllIdentities', []);
    if (result.success) {
      res.json(result.data || []);
    } else {
      res.status(500).json({ error: 'Failed to fetch identities', details: result.error });
    }
  } catch (error) {
    console.error('Get identities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/identities/:alias', authenticateToken, async (req, res) => {
  try {
    const result = await queryChaincode(req.user.kid_name, 'GetIdentityDetails', [req.params.alias]);
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: 'Failed to fetch identity details', details: result.error });
    }
  } catch (error) {
    console.error('Get identity details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/identities/:alias/roles', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const result = await invokeChaincode(req.user.kid_name, 'AssignRoleToIdentity', [req.params.alias, role]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Role assigned successfully' });
    } else {
      res.status(500).json({ error: 'Failed to assign role', details: result });
    }
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/identities/:alias/roles/:role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await invokeChaincode(req.user.kid_name, 'RemoveRoleFromIdentity', [req.params.alias, req.params.role]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Role removed successfully' });
    } else {
      res.status(500).json({ error: 'Failed to remove role', details: result });
    }
  } catch (error) {
    console.error('Remove role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/identities/:alias/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await invokeChaincode(req.user.kid_name, 'MakeIdentityAdmin', [req.params.alias]);
    
    if (isCallSuccessful(result)) {
      // Update local database
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET is_admin = 1 WHERE chaincode_alias = ?', [req.params.alias], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      res.json({ message: 'Admin status granted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to grant admin status', details: result });
    }
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/identities/:alias/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await invokeChaincode(req.user.kid_name, 'RemoveIdentityAdmin', [req.params.alias]);
    
    if (isCallSuccessful(result)) {
      // Update local database
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET is_admin = 0 WHERE chaincode_alias = ?', [req.params.alias], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      res.json({ message: 'Admin status removed successfully' });
    } else {
      res.status(500).json({ error: 'Failed to remove admin status', details: result });
    }
  } catch (error) {
    console.error('Remove admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Shipment Routes
app.get('/api/shipments/all', async (req, res) => {
  try {
    const { pageSize = '10', bookmark = '' } = req.query;
    
    // Use admin or first available user for guest access
    let kidName = req.user?.kid_name;
    if (!kidName) {
      const adminUser = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      kidName = adminUser?.kid_name;
    }

    if (!kidName) {
      return res.status(500).json({ error: 'No user available for query' });
    }

    const result = await queryChaincode(kidName, 'GetAllShipments', [pageSize, bookmark]);
    if (result.success) {
      res.json(normalizeShipmentResponse(result.data));
    } else {
      res.status(500).json({ error: 'Failed to fetch shipments', details: result.error });
    }
  } catch (error) {
    console.error('Get all shipments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/shipments/my', authenticateToken, async (req, res) => {
  try {
    const { pageSize = '10', bookmark = '' } = req.query;
    const result = await queryChaincode(req.user.kid_name, 'GetMyShipments', [pageSize, bookmark]);
    
    if (result.success) {
      res.json(normalizeShipmentResponse(result.data));
    } else {
      res.status(500).json({ error: 'Failed to fetch my shipments', details: result.error });
    }
  } catch (error) {
    console.error('Get my shipments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/shipments/status/:status', authenticateToken, async (req, res) => {
  try {
    const { pageSize = '10', bookmark = '' } = req.query;
    const result = await queryChaincode(req.user.kid_name, 'GetShipmentsByStatus', [req.params.status, pageSize, bookmark]);
    
    if (result.success) {
      res.json(result.data || { shipments: [], fetchedCount: 0, nextBookmark: '' });
    } else {
      res.status(500).json({ error: 'Failed to fetch shipments by status', details: result.error });
    }
  } catch (error) {
    console.error('Get shipments by status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/shipments/:id', async (req, res) => {
  try {
    // Use authenticated user or admin for guest access
    let kidName = req.user?.kid_name;
    if (!kidName) {
      const adminUser = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      kidName = adminUser?.kid_name;
    }

    if (!kidName) {
      return res.status(500).json({ error: 'No user available for query' });
    }

    const result = await queryChaincode(kidName, 'GetShipmentPublicDetails', [req.params.id]);
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: 'Failed to fetch shipment details', details: result.error });
    }
  } catch (error) {
    console.error('Get shipment details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/shipments/public/:id', async (req, res) => {
  try {
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }

    const result = await queryChaincode(adminUser.kid_name, 'GetShipmentPublicDetails', [req.params.id]);
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: 'Failed to fetch shipment details', details: result.error });
    }
  } catch (error) {
    console.error('Get public shipment details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/shipments/:id/qrcode', async (req, res) => {
  try {
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }
    const result = await queryChaincode(adminUser.kid_name, 'GetShipmentPublicDetails', [req.params.id]);
    if (!result.success) {
      return res.status(500).json({ error: 'Failed to fetch shipment details', details: result.error });
    }
    const link = result.data?.retailerData?.qrCodeLink || `${PUBLIC_SHIPMENT_BASE_URL}/${req.params.id}`;
    const dataUrl = await QRCode.toDataURL(link);
    res.json({ qrCodeDataUrl: dataUrl, link });
  } catch (error) {
    console.error('Generate QR code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/shipments', authenticateToken, requireRole(['farmer']), async (req, res) => {
  try {
    const { shipmentId, productName, description, quantity, unitOfMeasure, farmerData } = req.body;

    const organicSince = new Date(farmerData.organicSince);
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    if (organicSince > threeYearsAgo) {
      return res.status(400).json({ error: 'Farm must be organic for at least 3 years' });
    }
    if (parseFloat(farmerData.bufferZoneMeters) < 8) {
      return res.status(400).json({ error: 'Buffer zones must be at least 8 meters' });
    }

    const result = await invokeChaincode(req.user.kid_name, 'CreateShipment', [
      shipmentId, productName, description, quantity, unitOfMeasure, JSON.stringify(farmerData)
    ]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Shipment created successfully', transactionId: result.transactionID });
    } else {
      res.status(500).json({ error: 'Failed to create shipment', details: result });
    }
  } catch (error) {
    console.error('Create shipment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/shipments/:id/certification/submit', authenticateToken, requireRole(['farmer']), async (req, res) => {
  try {
    const result = await invokeChaincode(req.user.kid_name, 'SubmitForCertification', [req.params.id]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Shipment submitted for certification successfully' });
    } else {
      res.status(500).json({ error: 'Failed to submit for certification', details: result });
    }
  } catch (error) {
    console.error('Submit for certification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/shipments/:id/certification/record', authenticateToken, requireRole(['certifier']), async (req, res) => {
  try {
    const { inspectionDate, inspectionReportHash, certificationStatus, comments } = req.body;
    
    const result = await invokeChaincode(req.user.kid_name, 'RecordCertification', [
      req.params.id, inspectionDate, inspectionReportHash, certificationStatus, comments
    ]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Certification recorded successfully' });
    } else {
      res.status(500).json({ error: 'Failed to record certification', details: result });
    }
  } catch (error) {
    console.error('Record certification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/shipments/:id/process', authenticateToken, requireRole(['processor']), async (req, res) => {
  try {
    const { processorData } = req.body;
    
    const result = await invokeChaincode(req.user.kid_name, 'ProcessShipment', [
      req.params.id, JSON.stringify(processorData)
    ]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Shipment processed successfully' });
    } else {
      res.status(500).json({ error: 'Failed to process shipment', details: result });
    }
  } catch (error) {
    console.error('Process shipment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/shipments/:id/distribute', authenticateToken, requireRole(['distributor']), async (req, res) => {
  try {
    const { distributorData } = req.body;
    
    const result = await invokeChaincode(req.user.kid_name, 'DistributeShipment', [
      req.params.id, JSON.stringify(distributorData)
    ]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Shipment distributed successfully' });
    } else {
      res.status(500).json({ error: 'Failed to distribute shipment', details: result });
    }
  } catch (error) {
    console.error('Distribute shipment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/shipments/:id/receive', authenticateToken, requireRole(['retailer']), async (req, res) => {
  try {
    const { retailerData } = req.body;
    if (retailerData && !retailerData.qrCodeLink) {
      retailerData.qrCodeLink = `${PUBLIC_SHIPMENT_BASE_URL}/${req.params.id}`;
    }

    const result = await invokeChaincode(req.user.kid_name, 'ReceiveShipment', [
      req.params.id, JSON.stringify(retailerData)
    ]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Shipment received successfully', qrCodeLink: retailerData.qrCodeLink });
    } else {
      res.status(500).json({ error: 'Failed to receive shipment', details: result });
    }
  } catch (error) {
    console.error('Receive shipment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/shipments/transform', authenticateToken, requireRole(['processor']), async (req, res) => {
  try {
    const { inputConsumption, newProductsData, processorData } = req.body;
    
    const result = await invokeChaincode(
        req.user.kid_name,
        'TransformAndCreateProducts',
        [
          JSON.stringify(inputConsumption),
          JSON.stringify(newProductsData),
          JSON.stringify(processorData)
        ]
      );
  
      if (!isCallSuccessful(result)) {
        return res.status(500).json({ error: 'Failed to transform products', details: result });
      }
  
      /* --------------------------------------------------------------------
          The Go chain-code returns JSON in result.result that looks like:
          {
            "newShipmentIds": ["SHIP_…_DERIVED1", "SHIP_…_DERIVED2"]
          }
          Parse that blob and surface it to the caller.
        -------------------------------------------------------------------- */
  
      let newShipmentIds = [];
      try {
        const parsed = result.result ? JSON.parse(result.result) : null;
        if (parsed && Array.isArray(parsed.newShipmentIds)) {
          newShipmentIds = parsed.newShipmentIds;
        }
      } catch (_) {
        /* silent – we’ll just return an empty array */
      }
  
      return res.json({
        message: 'Products transformed successfully',
        newShipmentIds,               // 👈  pass these to /distribute later
        transactionId: result.transactionID
      });
  } catch (error) {
    console.error('Transform products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Shipment Management
app.post('/api/shipments/:id/archive', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const result = await invokeChaincode(req.user.kid_name, 'ArchiveShipment', [req.params.id, reason]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Shipment archived successfully' });
    } else {
      res.status(500).json({ error: 'Failed to archive shipment', details: result });
    }
  } catch (error) {
    console.error('Archive shipment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/shipments/:id/unarchive', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await invokeChaincode(req.user.kid_name, 'UnarchiveShipment', [req.params.id]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Shipment unarchived successfully' });
    } else {
      res.status(500).json({ error: 'Failed to unarchive shipment', details: result });
    }
  } catch (error) {
    console.error('Unarchive shipment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Recall Management Routes
app.post('/api/recalls/initiate', authenticateToken, async (req, res) => {
  try {
    const { shipmentId, recallId, reason } = req.body;
    
    // Note: According to the chaincode, current owner can initiate recall
    const result = await invokeChaincode(req.user.kid_name, 'InitiateRecall', [shipmentId, recallId, reason]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Recall initiated successfully' });
    } else {
      res.status(500).json({ error: 'Failed to initiate recall', details: result });
    }
  } catch (error) {
    console.error('Initiate recall error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/recalls/:recallId/linked-shipments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { primaryShipmentId, linkedShipmentIds } = req.body;
    
    const result = await invokeChaincode(req.user.kid_name, 'AddLinkedShipmentsToRecall', [
      req.params.recallId, primaryShipmentId, JSON.stringify(linkedShipmentIds)
    ]);
    
    if (isCallSuccessful(result)) {
      res.json({ message: 'Linked shipments added to recall successfully' });
    } else {
      res.status(500).json({ error: 'Failed to add linked shipments', details: result });
    }
  } catch (error) {
    console.error('Add linked shipments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/recalls/:shipmentId/related', authenticateToken, async (req, res) => {
  try {
    const { timeWindowHours = '24' } = req.query;
    
    const result = await queryChaincode(req.user.kid_name, 'QueryRelatedShipments', [req.params.shipmentId, timeWindowHours]);
    
    if (result.success) {
      res.json(result.data || []);
    } else {
      res.status(500).json({ error: 'Failed to query related shipments', details: result.error });
    }
  } catch (error) {
    console.error('Query related shipments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Utility Routes - Using alternative methods for missing chaincode functions
app.get('/api/utils/fullid/:alias', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await queryChaincode(req.user.kid_name, 'GetFullIDForAlias', [req.params.alias]);
    
    if (result.success) {
      res.json({ fullId: result.data });
    } else {
      res.status(500).json({ error: 'Failed to get FullID', details: result.error });
    }
  } catch (error) {
    console.error('Get FullID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// IPFS file upload for certifications
app.post('/api/ipfs/upload', authenticateToken, requireRole(['certifier', 'farmer']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const auth = Buffer.from(IPFS_CONFIG.appCred).toString('base64');
    const form = new FormData();
    form.append('file', req.file.buffer, req.file.originalname);
    const response = await axios.post(`${IPFS_CONFIG.apiUrlBase}/api/v0/add`, form, {
      headers: { ...form.getHeaders(), Authorization: `Basic ${auth}` },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
    const { Hash, Name } = response.data;
    const link = `${IPFS_CONFIG.apiUrlBase}/ipfs/${Hash}`;
    res.json({ hash: Hash, name: Name, link });
  } catch (err) {
    console.error('IPFS upload error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Current user information using TestGetCallerIdentity
app.get('/api/users/current/info', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const result = await queryChaincode(req.user.kid_name, 'TestGetCallerIdentity', []);
    
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: 'Failed to get caller identity', details: result.error });
    }
  } catch (error) {
    console.error('Get caller identity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// Check user admin status using GetIdentityDetails
app.get('/api/users/:alias/admin/status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  try {
    const result = await queryChaincode(req.user.kid_name, 'GetIdentityDetails', [req.params.alias]);
    
    if (result.success && result.data) {
      res.json({ isAdmin: result.data.isAdmin || false });
    } else {
      res.status(500).json({ error: 'Failed to check admin status', details: result.error });
    }
  } catch (error) {
    console.error('Check admin status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// Debug/Development Routes (keep for testing)
app.get('/api/debug/caller-identity', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  try {
    const result = await queryChaincode(req.user.kid_name, 'TestGetCallerIdentity', []);
    
    if (result.success) {
      res.json(result.data);
    } else {
      res.status(500).json({ error: 'Failed to get caller identity', details: result.error });
    }
  } catch (error) {
    console.error('Get caller identity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// System status using local database checks
app.get('/api/system/bootstrap-status', asyncHandler(async (req, res) => {
  try {
    // Check local database
    const localAdminCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users WHERE is_admin = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    // Try to check chaincode status using available functions
    let chaincodeResponsive = false;
    if (localAdminCount > 0) {
      const adminUser = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (adminUser) {
        const testResult = await queryChaincode(adminUser.kid_name, 'TestGetCallerIdentity', []);
        chaincodeResponsive = testResult.success;
      }
    }

    res.json({
      isBootstrapped: localAdminCount > 0 && chaincodeResponsive,
      localAdminCount,
      chaincodeResponsive
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// Add these routes to the server

// Get shipments the current user can act on
app.get('/api/shipments/actionable', authenticateToken, async (req, res) => {
  try {
    const { pageSize = '10', bookmark = '' } = req.query;
    const result = await queryChaincode(req.user.kid_name, 'GetMyActionableShipments', [pageSize, bookmark]);
    
    if (result.success) {
      res.json(normalizeShipmentResponse(result.data));
    } else {
      res.status(500).json({ error: 'Failed to fetch actionable shipments', details: result.error });
    }
  } catch (error) {
    console.error('Get actionable shipments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get actionable shipments with detailed action information
app.get('/api/shipments/actionable/detailed', authenticateToken, async (req, res) => {
  try {
    const { pageSize = '10', bookmark = '' } = req.query;
    const result = await queryChaincode(req.user.kid_name, 'GetMyActionableShipmentsWithActions', [pageSize, bookmark]);
    
    if (result.success) {
      res.json(result.data || { shipments: [], fetchedCount: 0, nextBookmark: '', userInfo: {} });
    } else {
      res.status(500).json({ error: 'Failed to fetch detailed actionable shipments', details: result.error });
    }
  } catch (error) {
    console.error('Get detailed actionable shipments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get aliases filtered by role (public access)
app.get('/api/aliases/role/:role', async (req, res) => {
  try {
    const { role } = req.params;
    
    // Validate role parameter
    const validRoles = ['farmer', 'processor', 'distributor', 'retailer', 'certifier', 'admin'];
    if (!validRoles.includes(role.toLowerCase())) {
      return res.status(400).json({ 
        error: `Invalid role '${role}'. Valid roles: ${validRoles.join(', ')}` 
      });
    }

    // Use admin or first available user for guest access
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }

    const result = await queryChaincode(adminUser.kid_name, 'GetAliasesByRole', [role]);
    if (result.success) {
      res.json(result.data || []);
    } else {
      res.status(500).json({ error: `Failed to fetch ${role} aliases`, details: result.error });
    }
  } catch (error) {
    console.error('Get aliases by role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get aliases with details filtered by role (public access)
app.get('/api/aliases/role/:role/details', async (req, res) => {
  try {
    const { role } = req.params;
    
    const validRoles = ['farmer', 'processor', 'distributor', 'retailer', 'certifier', 'admin'];
    if (!validRoles.includes(role.toLowerCase())) {
      return res.status(400).json({ 
        error: `Invalid role '${role}'. Valid roles: ${validRoles.join(', ')}` 
      });
    }

    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }

    const result = await queryChaincode(adminUser.kid_name, 'GetAliasesByRoleWithDetails', [role]);
    if (result.success) {
      res.json(result.data || []);
    } else {
      res.status(500).json({ error: `Failed to fetch ${role} alias details`, details: result.error });
    }
  } catch (error) {
    console.error('Get alias details by role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get role summary with counts (public access)
app.get('/api/roles/summary', async (req, res) => {
  try {
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }

    const result = await queryChaincode(adminUser.kid_name, 'GetAllRolesWithCounts', []);
    if (result.success) {
      res.json(result.data || { roleCounts: {}, totalUsers: 0 });
    } else {
      res.status(500).json({ error: 'Failed to fetch role summary', details: result.error });
    }
  } catch (error) {
    console.error('Get role summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Convenience endpoints for specific roles (public access)
app.get('/api/aliases/farmers', async (req, res) => {
  req.params.role = 'farmer';
  return app._router.handle(Object.assign(req, { url: '/api/aliases/role/farmer' }), res);
});

app.get('/api/aliases/processors', async (req, res) => {
  try {
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }
    const result = await queryChaincode(adminUser.kid_name, 'GetAliasesByRole', ['processor']);
    res.json(result.success ? result.data || [] : []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/aliases/distributors', async (req, res) => {
  try {
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }
    const result = await queryChaincode(adminUser.kid_name, 'GetAliasesByRole', ['distributor']);
    res.json(result.success ? result.data || [] : []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/aliases/retailers', async (req, res) => {
  try {
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }
    const result = await queryChaincode(adminUser.kid_name, 'GetAliasesByRole', ['retailer']);
    res.json(result.success ? result.data || [] : []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/aliases/certifiers', async (req, res) => {
  try {
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }
    const result = await queryChaincode(adminUser.kid_name, 'GetAliasesByRole', ['certifier']);
    res.json(result.success ? result.data || [] : []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/aliases/admins', async (req, res) => {
  try {
    const adminUser = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE is_admin = 1 LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!adminUser) {
      return res.status(500).json({ error: 'No user available for query' });
    }
    const result = await queryChaincode(adminUser.kid_name, 'GetAliasesByRole', ['admin']);
    res.json(result.success ? result.data || [] : []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Foodtrace BFF Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});