/**
 * Network Blocker for Jest Tests
 * Blocks ALL network traffic: HTTP, HTTPS, TCP (databases), DNS
 * 
 * Usage: Add to jest.config.js setupFilesAfterEnv
 * 
 * This ensures tests NEVER make real network requests in CI/CD
 */

const net = require('net');
const http = require('http');
const https = require('https');
const dns = require('dns');

// Store original functions
const originalNetConnect = net.Socket.prototype.connect;
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const originalDnsLookup = dns.lookup;
const originalDnsResolve = dns.resolve;

// Whitelist for localhost (if needed for some tests)
const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1'];

/**
 * Block TCP connections (MongoDB, MSSQL, Redis, etc.)
 */
net.Socket.prototype.connect = function (...args) {
  const options = args[0];
  const host = options?.host || options?.hostname || 'unknown';

  if (ALLOWED_HOSTS.includes(host)) {
    return originalNetConnect.apply(this, args);
  }

  const error = new Error(
    `❌ NETWORK BLOCKED: Attempted TCP connection to ${host}\n` +
    `Tests must not make real network requests!\n` +
    `Mock your database connections in tests.`
  );
  error.code = 'NETWORK_BLOCKED';
  throw error;
};

/**
 * Block HTTP requests
 */
http.request = function (url, options, callback) {
  const host = options?.hostname || options?.host || url?.hostname || url?.host || 'unknown';

  if (ALLOWED_HOSTS.includes(host)) {
    return originalHttpRequest.apply(this, arguments);
  }

  const error = new Error(
    `❌ NETWORK BLOCKED: Attempted HTTP request to ${host}\n` +
    `Tests must not make real network requests!\n` +
    `Mock your HTTP calls (axios, fetch, etc.) in tests.`
  );
  error.code = 'NETWORK_BLOCKED';
  throw error;
};

/**
 * Block HTTPS requests
 */
https.request = function (url, options, callback) {
  const host = options?.hostname || options?.host || url?.hostname || url?.host || 'unknown';

  if (ALLOWED_HOSTS.includes(host)) {
    return originalHttpsRequest.apply(this, arguments);
  }

  const error = new Error(
    `❌ NETWORK BLOCKED: Attempted HTTPS request to ${host}\n` +
    `Tests must not make real network requests!\n` +
    `Mock your HTTPS calls (OpenAI API, etc.) in tests.`
  );
  error.code = 'NETWORK_BLOCKED';
  throw error;
};

/**
 * Block DNS lookups
 */
dns.lookup = function (hostname, options, callback) {
  if (ALLOWED_HOSTS.includes(hostname)) {
    return originalDnsLookup.apply(this, arguments);
  }

  const error = new Error(
    `❌ NETWORK BLOCKED: Attempted DNS lookup for ${hostname}\n` +
    `Tests must not make real network requests!`
  );
  error.code = 'NETWORK_BLOCKED';
  
  if (typeof callback === 'function') {
    callback(error);
  } else if (typeof options === 'function') {
    options(error);
  } else {
    throw error;
  }
};

/**
 * Block DNS resolve
 */
dns.resolve = function (hostname, rrtype, callback) {
  if (ALLOWED_HOSTS.includes(hostname)) {
    return originalDnsResolve.apply(this, arguments);
  }

  const error = new Error(
    `❌ NETWORK BLOCKED: Attempted DNS resolve for ${hostname}\n` +
    `Tests must not make real network requests!`
  );
  error.code = 'NETWORK_BLOCKED';
  
  if (typeof callback === 'function') {
    callback(error);
  } else if (typeof rrtype === 'function') {
    rrtype(error);
  } else {
    throw error;
  }
};

console.log('🛡️  Network blocker enabled - All network requests will be blocked in tests');
console.log('   ✅ Allowed: localhost, 127.0.0.1, ::1');
console.log('   ❌ Blocked: All external hosts (databases, APIs, etc.)');
