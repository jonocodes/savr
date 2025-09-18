// Mock for the environment config to avoid import.meta.env issues
const environmentConfig = {
  // Add any environment variables that might be needed
  VITE_APP_MODE: 'test',
  VITE_DEBUG: 'false',
};

module.exports = { environmentConfig };
