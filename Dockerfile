FROM node:22-bookworm

WORKDIR /app

# Install dependencies before copying source so this layer caches.
# NODE_ENV stays unset here so npm ci keeps tsx, which the worker and seed use.
COPY package.json package-lock.json ./
RUN npm ci

# Chromium and the system libraries Playwright needs to launch it.
RUN npx playwright install --with-deps chromium

COPY . .
RUN sed -i 's/\r$//' scripts/docker-entrypoint.sh \
  && chmod +x scripts/docker-entrypoint.sh \
  && npm run build \
  && mkdir -p .data public/artifacts

ENV PORT=3000
ENV NODE_ENV=production
ENV PRAXIS_HEADLESS=true
# Playwright runs in this same container, so localhost is the Next server.
ENV PRAXIS_BASE_URL=http://localhost:3000

EXPOSE 3000

# Seed once, then run the web server and the worker. See the entrypoint.
CMD ["./scripts/docker-entrypoint.sh"]
