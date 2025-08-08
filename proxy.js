// TODO: never quite got this to work

import http from "http";
import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer();

http
  .createServer(function (req, res) {
    try {
      // Parse the target URL from the query parameter, e.g. ?q=https://example.com
      const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
      const targetUrl = urlParams.get("q");
      if (!targetUrl) {
        res.writeHead(400);
        return res.end('Missing target URL query parameter "q"');
      }

      // Remove query string from path and set it properly on proxy request
      proxy.on("proxyReq", (proxyReq) => {
        const parsedUrl = new URL(targetUrl);
        proxyReq.path = parsedUrl.pathname + parsedUrl.search;
        // Optionally, adjust headers if needed
        proxyReq.setHeader("host", parsedUrl.host);
      });

      // Proxy the request to the target URL specified in 'q'
      proxy.web(req, res, { target: targetUrl, changeOrigin: true }, (err) => {
        res.writeHead(502);
        res.end("Proxy error: " + err.message);
      });
    } catch (err) {
      res.writeHead(500);
      res.end("Server error: " + err.message);
    }
  })
  .listen(8080, () => {
    console.log("Proxy server running on http://localhost:8080");
  });
