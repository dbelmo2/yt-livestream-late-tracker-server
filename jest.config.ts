import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  silent: false,
  verbose: true,
  coverageDirectory: 'coverage', // Output directory for reports
  coverageProvider: 'v8', // Use V8 for TypeScript
  coverageReporters: ['text', 'lcov', 'json'], // Report formats
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}', // Include all TypeScript files in src
    '!src/**/*.d.ts', // Exclude type definitions
    '!src/**/index.ts', // Exclude barrel files (optional)
    '!src/config/database.ts', // Exclude the database config file
    '!src/routes/**', // Exclude the routes folder
    '!src/middleware/rateLimit.ts', // Exclude the rateLimit middleware
    '!src/services/youtube.ts', // Exclude the youtube service


  ],
  coverageThreshold: {
    global: {
      branches: 70, // Optional: Set minimum coverage thresholds
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};

export default config;