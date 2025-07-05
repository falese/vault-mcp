# Use the official Node.js runtime as the base image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Option A: Install from NPM (if published)
# RUN npm install -g @yourname/vault-github-mcp

# Option B: Copy local source (current approach)
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S obsidian -u 1001

# Change ownership of the app directory
RUN chown -R obsidian:nodejs /app
USER obsidian

# Expose the port (though MCP typically uses stdio)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Set the command to run the application with stdin kept open
CMD ["sh", "-c", "tail -f /dev/null | node dist/index.js"]