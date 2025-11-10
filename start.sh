#!/bin/bash

# Kill any existing processes on ports 3000 and 7767
echo "Cleaning up old processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:7767 | xargs kill -9 2>/dev/null

# Wait a moment
sleep 1

# Start the backend server in the background
echo "Starting backend server on port 3000..."
node --env-file=.env src/server.ts &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Start the frontend dev server
echo "Starting frontend dev server on port 7767..."
pnpm dev

# When user presses Ctrl+C, kill both processes
trap "echo 'Shutting down...'; kill $BACKEND_PID; exit" INT TERM
