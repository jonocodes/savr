# syntax=docker/dockerfile:1

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine as base

WORKDIR /usr/src/web

COPY web/package*.json .

# install dependencies
RUN npm ci

COPY ../shared/ ../shared/
COPY ../web/ ./

# build javascript
RUN npm run build

ENV NODE_ENV production

# Run the application as a non-root user.
USER node

EXPOSE 8080

CMD node dist/cli.js --start-server
