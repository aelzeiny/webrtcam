# Multi-stage build for WebRTCam

# Stage 1: Build the client
FROM node:18-alpine AS client-builder
WORKDIR /app

# Copy the client files
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client ./client/
RUN cd client && npm run build

# Stage 2: Build the server using node image with more complete build tools
FROM node:18 AS server-builder
WORKDIR /app

# Copy server files
COPY server/package*.json ./server/
RUN cd server && npm ci

COPY server ./server/
# Create public directory if it doesn't exist
RUN mkdir -p ./server/public
# Copy built client from the first stage
COPY --from=client-builder /app/client/dist ./server/public/

# Final stage: Run the server
FROM node:18
WORKDIR /app

# Copy package.json and install dependencies
COPY --from=server-builder /app/server/package*.json ./
RUN npm ci --omit=dev

# Copy server code and client build
COPY --from=server-builder /app/server/src ./src
COPY --from=server-builder /app/server/public ./public

# Expose the port the server runs on
EXPOSE 3000
# Expose MediaSoup RTC ports
EXPOSE 10000-10100/udp

# Start the application
CMD ["node", "src/index.js"]