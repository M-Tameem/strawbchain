#!/usr/bin/env node
/**
 * Simple script to exercise the distributor sensor log endpoint.
 *
 * Usage:
 *   node test-sensor-logs.js [shipmentId]
 *
 * Environment variables:
 *   TEST_SERVER_URL - base URL of running server (default http://localhost:3001)
 *   SENSOR_KID - kidName/alias for invoking chaincode (required)
 *   DISTRIBUTOR_USERNAME - username to fetch logs (optional)
 *   DISTRIBUTOR_PASSWORD - password to fetch logs (optional)
 */

const axios = require('axios');
require('dotenv').config();

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001';
const SHIPMENT_ID = process.argv[2] || process.env.TEST_SHIPMENT_ID || 'SHIPMENT_ID';
const SENSOR_KID = process.env.SENSOR_KID;

if (!SENSOR_KID) {
  console.error('SENSOR_KID environment variable is required');
  process.exit(1);
}

async function submitSensorLog() {
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
  const { DISTRIBUTOR_USERNAME, DISTRIBUTOR_PASSWORD } = process.env;
  if (!DISTRIBUTOR_USERNAME || !DISTRIBUTOR_PASSWORD) {
    console.log('DISTRIBUTOR_USERNAME or DISTRIBUTOR_PASSWORD not set, skipping GET test');
    return;
  }

  const loginRes = await axios.post(`${SERVER_URL}/api/auth/login`, {
    username: DISTRIBUTOR_USERNAME,
    password: DISTRIBUTOR_PASSWORD,
  });
  const token = loginRes.data.token;

  const getRes = await axios.get(`${SERVER_URL}/api/shipments/${SHIPMENT_ID}/sensor-logs`, {
    headers: { Authorization: `Bearer ${token}` },
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
