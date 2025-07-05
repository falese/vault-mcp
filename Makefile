# Vault GitHub MCP Server - Simple Docker Management
.PHONY: help build start stop restart logs status clean setup test dev

# Default target
help: ## Show this help message
	@echo "🐳 Vault GitHub MCP Server - Simple Commands"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-15s\033[0m %s\n", $1, $2}' $(MAKEFILE_LIST)

setup: ## Create .env file and build TypeScript
	@echo "🚀 Setting up Vault MCP Server..."
	@if [ ! -f .env ]; then \
		echo "Creating .env template..."; \
		echo "GITHUB_TOKEN=your_token_here" > .env; \
		echo "REPO_OWNER=falese" >> .env; \
		echo "REPO_NAME=vault" >> .env; \
		echo "VAULT_PATH=" >> .env; \
		echo "✅ .env file created. Please edit it with your values."; \
	else \
		echo "⚠️  .env file already exists."; \
	fi
	@if [ ! -d "dist" ]; then \
		echo "🔨 Building TypeScript..."; \
		npm run build; \
	fi

build-ts: ## Build TypeScript code
	@echo "🔨 Building TypeScript..."
	npm run build

build: build-ts ## Build the Docker image
	@echo "🐳 Building Docker image..."
	docker-compose build

start: ## Start the MCP server
	@echo "🚀 Starting Vault MCP Server..."
	docker-compose up -d
	@echo "✅ Server started! Check status with 'make status'"

stop: ## Stop the MCP server  
	@echo "🛑 Stopping Vault MCP Server..."
	docker-compose down
	@echo "✅ Server stopped."

restart: build-ts ## Rebuild TypeScript and restart
	@echo "🔄 Rebuilding and restarting..."
	docker-compose down
	docker-compose build
	docker-compose up -d
	@echo "✅ Server restarted with latest code."

logs: ## View server logs
	@echo "📋 Viewing logs (Press Ctrl+C to exit)..."
	docker-compose logs -f vault-mcp

status: ## Check server status
	@echo "📊 Server Status:"
	@docker-compose ps
	@echo ""
	@echo "🔍 Health Check:"
	@docker-compose exec vault-mcp node -e "console.log('✅ Server is running!')" 2>/dev/null || echo "❌ Server is not responding"

test: ## Test GitHub connection
	@echo "🧪 Testing GitHub API connection..." && \
	if [ -f .env ]; then \
		. .env && \
		if [ "$$GITHUB_TOKEN" = "your_token_here" ]; then \
			echo "❌ Please update your .env file with real values"; \
		else \
			echo "Testing: https://api.github.com/repos/$$REPO_OWNER/$$REPO_NAME" && \
			curl -s -H "Authorization: token $$GITHUB_TOKEN" \
				 "https://api.github.com/repos/$$REPO_OWNER/$$REPO_NAME" | \
				 jq -r 'if .message then "❌ Error: " + .message else "✅ Repository accessible!" end' || \
				 echo "❌ Test failed"; \
		fi; \
	else \
		echo "❌ .env file not found. Run 'make setup' first."; \
	fi
dev: build-ts ## Start in development mode (rebuild on changes)
	@echo "🔧 Starting in development mode..."
	docker-compose up --build

clean: ## Clean up containers and images
	@echo "🧹 Cleaning up..."
	docker-compose down -v
	docker-compose rm -f
	docker image prune -f
	@echo "✅ Cleanup complete."

config: ## Show Claude Desktop configuration
	@echo "📝 Claude Desktop Configuration:"
	@echo ""
	@echo "Add this to your claude_desktop_config.json:"
	@echo ""
	@echo '{'
	@echo '  "mcpServers": {'
	@echo '    "vault-mcp": {'
	@echo '      "command": "docker",'
	@echo '      "args": ['
	@echo '        "exec",'
	@echo '        "-i",'
	@echo '        "vault-mcp",'
	@echo '        "node",'
	@echo '        "dist/index.js"'
	@echo '      ],'
	@echo '      "env": {}'
	@echo '    }'
	@echo '  }'
	@echo '}'
	@echo ""
	@echo "Config file location:"
	@echo "  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
	@echo "  Windows: %APPDATA%\\Claude\\claude_desktop_config.json"

quick-start: setup build start config ## Complete setup and start
	@echo ""
	@echo "🎉 Quick start complete!"
	@echo ""
	@echo "✅ TypeScript built"
	@echo "✅ Docker container running"
	@echo "✅ Configuration shown above"
	@echo ""
	@echo "Next steps:"
	@echo "1. Edit .env with your GitHub token (if not done already)"
	@echo "2. Run 'make restart' if you updated .env"
	@echo "3. Add configuration to Claude Desktop"
	@echo "4. Restart Claude Desktop"