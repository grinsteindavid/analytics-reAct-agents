module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.integration.test.ts'],
  moduleNameMapper: {
    '^zod/v3$': 'zod',
  },
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    // NOTE: No network-blocker — integration tests need real DB connections
  ],
  transform: {
    '^.+\\.(js|ts)$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: false,
            decorators: true,
          },
          target: 'esnext',
        },
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/', '\\.pnp\\.[^\\/]+$', `/dist/`, `/dist-esm/`],
  testTimeout: 30000,
};
