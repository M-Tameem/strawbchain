#!/usr/bin/env node
/**
 * Simple script to exercise the distributor sensor log endpoint.
 *
 * Usage:
 *   node test-sensor-logs.js [shipmentId]
 *
 * Environment variables:
 *   TEST_SERVER_URL - base URL of running server (default http://localhost:3001)
 *   SENSOR_KID - kidName/alias for invoking chaincode (optional if distributor credentials provided)
 *   DISTRIBUTOR_USERNAME - distributor login to derive kidName / fetch logs (optional)
 *   DISTRIBUTOR_PASSWORD - distributor password to derive kidName / fetch logs (optional)
 */

const axios = require('axios');
require('dotenv').config();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001';
const SHIPMENT_ID = process.argv[2] || process.env.TEST_SHIPMENT_ID || 'SHIPMENT_ID';
let SENSOR_KID = process.env.SENSOR_KID;
const DISTRIBUTOR_USERNAME = process.env.DISTRIBUTOR_USERNAME;
const DISTRIBUTOR_PASSWORD = process.env.DISTRIBUTOR_PASSWORD;
let authToken;

async function ensureAuth() {
  if (SENSOR_KID && authToken) return;
  if (DISTRIBUTOR_USERNAME && DISTRIBUTOR_PASSWORD) {
    const loginRes = await axios.post(`${SERVER_URL}/api/auth/login`, {
      username: DISTRIBUTOR_USERNAME,
      password: DISTRIBUTOR_PASSWORD,
    });
    authToken = loginRes.data.token;
    if (!SENSOR_KID) {
      SENSOR_KID = loginRes.data.user.kid_name;
      console.log('Using kidName from login:', SENSOR_KID);
    }
    return;
  }
  if (!SENSOR_KID) {
    console.error('Provide SENSOR_KID or DISTRIBUTOR_USERNAME and DISTRIBUTOR_PASSWORD');
    process.exit(1);
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
  if (!DISTRIBUTOR_USERNAME || !DISTRIBUTOR_PASSWORD) {
    console.log('DISTRIBUTOR_USERNAME or DISTRIBUTOR_PASSWORD not set, skipping GET test');
    return;
  }
  await ensureAuth();
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
