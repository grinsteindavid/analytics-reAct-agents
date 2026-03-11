// Register hook to remap 'zod/v3' → 'zod' for ts-node
// Mirrors the moduleNameMapper in jest.config.js
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'zod/v3') request = 'zod';
  return originalResolve.call(this, request, parent, isMain, options);
};
