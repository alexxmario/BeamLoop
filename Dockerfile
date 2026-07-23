FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/legal ./legal
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/legal ./legal

# Railway mounts persistent volumes after the image is built. The mount is
# root-owned, so the runtime must retain permission to initialize SQLite and
# media directories on that volume.
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["npm", "start"]
