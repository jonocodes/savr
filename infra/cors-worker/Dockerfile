# Self-hosted Savr CORS proxy (the Node shell, node.js). No dependencies to
# install. See README.md "Self-host without Cloudflare".
FROM node:22-alpine
WORKDIR /app
COPY package.json core.js node.js guarded-fetch.js ssrf-policy.js ./
ENV PORT=8787 HOST=0.0.0.0
EXPOSE 8787
USER node
CMD ["node", "node.js"]
