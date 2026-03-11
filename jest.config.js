module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/index.ts'
  ],
  moduleNameMapper: {
    '^zod/v3$': 'zod',
  },
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/jest.network-blocker.js', // Block ALL network: HTTP, HTTPS, TCP (databases)
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
};
