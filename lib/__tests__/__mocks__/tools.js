// Mock for the tools module
const tools = {
  fetchWithTimeout: async (url) => {
    return {
      ok: true,
      text: async () => '<html><body>Mock HTML</body></html>',
      headers: {
        get: (name) => name === 'content-type' ? 'text/html' : null,
      },
    };
  },
  imageToDataUrl: async (blob) => {
    return 'data:image/jpeg;base64,mock-data-url';
  },
};

module.exports = tools;
