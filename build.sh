#!/bin/bash
# Build script to bundle client and set up server

# Make sure we're in the project root
cd "$(dirname "$0")"

echo "=== Building WebRTCam client and server ==="

# Install client dependencies
echo "=== Installing client dependencies ==="
cd client
npm install
if [ $? -ne 0 ]; then
  echo "Error installing client dependencies. Exiting."
  exit 1
fi

# Build client
echo "=== Building client ==="
npm run build
if [ $? -ne 0 ]; then
  echo "Error building client. Exiting."
  exit 1
fi

# Install server dependencies 
echo "=== Installing server dependencies ==="
cd ../server
npm install
if [ $? -ne 0 ]; then
  echo "Error installing server dependencies. Exiting."
  exit 1
fi

# Create public directory in server if it doesn't exist
mkdir -p public

# Copy built client files to server's public directory
echo "=== Copying client build to server public directory ==="
cp -r ../client/dist/* public/

echo "=== Build complete! ==="
echo ""
echo "To start the server, run: cd server && npm start"
echo "The application will be available at: http://localhost:3000"
echo ""
echo "For development mode:"
echo "1. Start the server: cd server && npm run dev"
echo "2. Start the client: cd client && npm start"
echo "The development client will be available at: http://localhost:5173"