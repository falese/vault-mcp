# Obsidian GitHub MCP Server Setup

This MCP server allows you to query your Obsidian vault stored in GitHub through Claude or other MCP-compatible AI assistants.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **GitHub Personal Access Token** with repository read permissions
3. **Obsidian vault** stored in a GitHub repository

## Installation

1. **Create a new directory for your MCP server:**

   ```bash
   mkdir obsidian-github-mcp
   cd obsidian-github-mcp
   ```

2. **Save the files:**

   - Save the TypeScript code as `src/index.ts`
   - Save the package.json as `package.json`
   - Save the environment example as `.env.example`

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Create TypeScript configuration:**
   ```bash
   npx tsc --init
   ```

## Configuration

1. **Create a GitHub Personal Access Token:**

   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Generate a new token with `repo` permissions (or `public_repo` for public repositories)
   - Copy the token

2. **Set up environment variables:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your values:

   ```bash
   GITHUB_TOKEN=ghp_your_actual_token_here
   REPO_OWNER=your-github-username
   REPO_NAME=your-vault-repository-name
   VAULT_PATH=path/to/vault/in/repo  # Optional, leave empty if vault is in root
   ```

## Build and Test

1. **Build the project:**

   ```bash
   npm run build
   ```

2. **Test the server:**
   ```bash
   npm start
   ```

## Claude Desktop Integration

To use this MCP server with Claude Desktop, add it to your Claude configuration:

### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian-github": {
      "command": "node",
      "args": ["/path/to/your/obsidian-github-mcp/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "REPO_OWNER": "your-username",
        "REPO_NAME": "your-vault-repo",
        "VAULT_PATH": ""
      }
    }
  }
}
```

### Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json` with the same format.

## Available Tools

The MCP server provides three tools:

1. **search_notes**: Search for notes by content or filename

   - Parameters: `query` (required), `limit` (optional, default 10)

2. **get_note**: Retrieve the full content of a specific note

   - Parameters: `path` (required)

3. **list_notes**: List all notes in the vault or a specific folder
   - Parameters: `folder` (optional)

## Usage Examples

Once configured, you can use these commands in Claude:

- "Search my notes for 'project management'"
- "Get the content of my daily note from yesterday"
- "List all notes in my 'Research' folder"
- "Find notes about machine learning"

## Security Notes

- Store your GitHub token securely
- Use environment variables instead of hardcoding credentials
- Consider using a dedicated GitHub account for API access
- Regularly rotate your access tokens

## Troubleshooting

**Common issues:**

1. **"Missing required environment variables"**

   - Ensure all required environment variables are set
   - Check that your .env file is properly formatted

2. **"API rate limit exceeded"**

   - The server includes caching to reduce API calls
   - Consider using a dedicated GitHub token for the MCP server

3. **"Authentication failed"**

   - Verify your GitHub token has the correct permissions
   - Check that the token hasn't expired

4. **"Repository not found"**
   - Ensure the repository name and owner are correct
   - Verify the repository is accessible with your token

## Advanced Configuration

### Custom Search Algorithms

You can modify the search scoring algorithm in the `searchNotes` method to better match your needs.

### Caching

The server includes a 5-minute cache for file contents. Adjust the `cacheExpiry` value to change this behavior.

### File Types

Currently configured for `.md` files. Modify the file extension check to support other formats if needed.
