// Test script to verify dynamic URL resolution
console.log('Testing dynamic URL resolution...');

// Mock environment variables
const mockEnv = {
  VITE_APP_URL: undefined
};

// Test cases
const testCases = [
  {
    name: 'With VITE_APP_URL set',
    env: { VITE_APP_URL: 'https://staging.tipz.app' },
    expected: 'https://staging.tipz.app/@testuser'
  },
  {
    name: 'Without VITE_APP_URL (fallback to window.location.origin)',
    env: {},
    expected: 'http://localhost:3000/@testuser'
  }
];

// Mock window.location.origin
global.window = {
  location: {
    origin: 'http://localhost:3000'
  }
};

// Mock import.meta.env
global.import = {
  meta: {
    env: mockEnv
  }
};

function getTipDomain() {
  return mockEnv.VITE_APP_URL || global.window.location.origin;
}

function getTipUrl(username) {
  const domain = getTipDomain();
  return `${domain}/@${username}`;
}

// Run tests
testCases.forEach(testCase => {
  mockEnv.VITE_APP_URL = testCase.env.VITE_APP_URL;
  const result = getTipUrl('testuser');
  const passed = result === testCase.expected;
  
  console.log(`\n${testCase.name}:`);
  console.log(`  Expected: ${testCase.expected}`);
  console.log(`  Got:      ${result}`);
  console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}`);
});

console.log('\nTest completed!');
