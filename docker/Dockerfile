FROM oven/bun:latest
WORKDIR /app

# Install Node.js and npm (required for frontend build)
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Copy root package files
COPY package.json bun.lock* ./
# Install root dependencies
RUN bun install

# Copy frontend package files
COPY src/frontend/package*.json ./src/frontend/
# Install frontend dependencies
RUN cd src/frontend && npm install

# Copy the entire application code
COPY . .

# Build the frontend (creates src/frontend/dist)
RUN cd src/frontend && npm run build

# Expose the port (Porter uses 80)
EXPOSE 80
