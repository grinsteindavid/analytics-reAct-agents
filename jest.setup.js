// Mock environment variables for tests
process.env.OPENAI_API_KEY = 'test-key';
process.env.LANGCHAIN_API_KEY = 'test-key';

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
