// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

#!/usr/bin/env node
/**
 * Simple script to exercise the distributor sensor log endpoint.
 *
 * Usage:
 *   node test-sensor-logs.js [shipmentId]
 *
 * Environment variables:
 *   TEST_SERVER_URL - base URL of running server (default http://localhost:3001)
 *   SENSOR_KID - kidName/alias for invoking chaincode (optional; auto-derived from DB if absent)
 *   JWT_SECRET - used to generate auth token for fetching logs
 */

const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001';
const SHIPMENT_ID = process.argv[2] || process.env.TEST_SHIPMENT_ID || 'SHIPMENT_ID';
let SENSOR_KID = process.env.SENSOR_KID;
let authToken;

async function loadDistributor() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, 'foodtrace.db');
    const db = new sqlite3.Database(dbPath);
    db.get('SELECT * FROM users WHERE role = ?', ['distributor'], (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function ensureAuth() {
  if (SENSOR_KID && authToken) return;
  const user = await loadDistributor();
  if (!user) {
    console.error('No distributor user found in database');
    process.exit(1);
  }
  SENSOR_KID = SENSOR_KID || user.kid_name;
  console.log('Using kidName from DB:', SENSOR_KID);

  if (process.env.JWT_SECRET) {
    const payload = {
      id: user.id,
      username: user.username,
      kid_name: user.kid_name,
      chaincode_alias: user.chaincode_alias,
      role: user.role,
      is_admin: !!user.is_admin,
    };
    authToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
  } else {
    console.warn('JWT_SECRET not set, unable to generate auth token for GET test');
  }
}

async function submitSensorLog() {
  await ensureAuth();
  const payload = {
    kidName: SENSOR_KID,
    temperature: 4.2,
    humidity: 70,
    latitude: 40.7128,
    longitude: -74.0060,
    timestamp: new Date().toISOString(),
  };

  const url = `${SERVER_URL}/api/shipments/${SHIPMENT_ID}/sensor-logs`;
  const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
  console.log('POST status:', res.status, '- response:', res.data);
}

async function fetchSensorLogs() {
  await ensureAuth();
  if (!authToken) {
    console.log('No auth token available, skipping GET test');
    return;
  }
  const getRes = await axios.get(`${SERVER_URL}/api/shipments/${SHIPMENT_ID}/sensor-logs`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  console.log('GET status:', getRes.status, '- logs:', getRes.data);
}

(async () => {
  try {
    await submitSensorLog();
    await fetchSensorLogs();
  } catch (err) {
    console.error('Test failed:', err.response?.data || err.message || err);
    process.exit(1);
  }
})();
