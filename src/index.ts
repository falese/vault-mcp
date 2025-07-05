#!/usr/bin/env node



import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const VAULT_PATH = process.env.VAULT_PATH || ""; // Path within repo where vault is located

if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
  console.error("Missing required environment variables: GITHUB_TOKEN, REPO_OWNER, REPO_NAME");
  process.exit(1);
}

// Type-safe variables (we've already checked they exist above)
const GITHUB_TOKEN_SAFE = GITHUB_TOKEN as string;
const REPO_OWNER_SAFE = REPO_OWNER as string;
const REPO_NAME_SAFE = REPO_NAME as string;

const octokit = new Octokit({ auth: GITHUB_TOKEN_SAFE });

// Schemas for tool parameters
const SearchNotesSchema = z.object({
  query: z.string().describe("Search query to find notes"),
  limit: z.number().optional().default(10).describe("Maximum number of results to return"),
});

const GetNoteSchema = z.object({
  path: z.string().describe("Path to the specific note file"),
});

const ListNotesSchema = z.object({
  folder: z.string().optional().describe("Specific folder to list notes from"),
});

class ObsidianMCPServer {
  private server: Server;
  private fileCache: Map<string, { content: string; lastModified: string }> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.server = new Server(
      {
        name: "obsidian-github-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_notes",
            description: "Search for notes in the Obsidian vault by content or filename",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query to find notes",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results to return",
                  default: 10,
                },
              },
              required: ["query"],
            },
          } as Tool,
          {
            name: "get_note",
            description: "Retrieve the full content of a specific note",
            inputSchema: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path to the specific note file",
                },
              },
              required: ["path"],
            },
          } as Tool,
          {
            name: "list_notes",
            description: "List all notes in the vault or a specific folder",
            inputSchema: {
              type: "object",
              properties: {
                folder: {
                  type: "string",
                  description: "Specific folder to list notes from (optional)",
                },
              },
              required: [],
            },
          } as Tool,
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_notes":
            return await this.searchNotes(SearchNotesSchema.parse(args));
          case "get_note":
            return await this.getNote(GetNoteSchema.parse(args));
          case "list_notes":
            return await this.listNotes(ListNotesSchema.parse(args));
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async getRepoContents(path: string = ""): Promise<any[]> {
    const fullPath = VAULT_PATH ? `${VAULT_PATH}/${path}`.replace(/\/+/g, '/') : path;
    
    try {
      const response = await octokit.rest.repos.getContent({
        owner: REPO_OWNER_SAFE,
        repo: REPO_NAME_SAFE,
        path: fullPath,
      });

      return Array.isArray(response.data) ? response.data : [response.data];
    } catch (error) {
      console.error(`Error getting repo contents for path ${fullPath}:`, error);
      return [];
    }
  }

  private async getFileContent(path: string): Promise<string> {
    const cacheKey = `${REPO_OWNER_SAFE}/${REPO_NAME_SAFE}/${path}`;
    
    // Check cache first
    const cached = this.fileCache.get(cacheKey);
    if (cached && Date.now() - new Date(cached.lastModified).getTime() < this.cacheExpiry) {
      return cached.content;
    }

    const fullPath = VAULT_PATH ? `${VAULT_PATH}/${path}`.replace(/\/+/g, '/') : path;
    
    try {
      const response = await octokit.rest.repos.getContent({
        owner: REPO_OWNER_SAFE,
        repo: REPO_NAME_SAFE,
        path: fullPath,
      });

      if (Array.isArray(response.data) || response.data.type !== 'file') {
        throw new Error(`${path} is not a file`);
      }

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      
      // Cache the content
      this.fileCache.set(cacheKey, {
        content,
        lastModified: new Date().toISOString(),
      });

      return content;
    } catch (error) {
      throw new Error(`Failed to get file content for ${path}: ${error}`);
    }
  }

  private async getAllMarkdownFiles(): Promise<Array<{ path: string; name: string }>> {
    const files: Array<{ path: string; name: string }> = [];
    
    const processDirectory = async (dirPath: string = "") => {
      const contents = await this.getRepoContents(dirPath);
      
      for (const item of contents) {
        if (item.type === 'file' && item.name.endsWith('.md')) {
          files.push({
            path: dirPath ? `${dirPath}/${item.name}` : item.name,
            name: item.name,
          });
        } else if (item.type === 'dir') {
          const subDirPath = dirPath ? `${dirPath}/${item.name}` : item.name;
          await processDirectory(subDirPath);
        }
      }
    };

    await processDirectory();
    return files;
  }

  private async searchNotes(params: z.infer<typeof SearchNotesSchema>) {
    const { query, limit } = params;
    
    try {
      const allFiles = await this.getAllMarkdownFiles();
      const results: Array<{ path: string; name: string; snippet: string; score: number }> = [];

      for (const file of allFiles) {
        try {
          const content = await this.getFileContent(file.path);
          
          // Simple scoring based on query matches
          const lowerQuery = query.toLowerCase();
          const lowerContent = content.toLowerCase();
          const lowerName = file.name.toLowerCase();
          
          let score = 0;
          
          // Filename matches get higher score
          if (lowerName.includes(lowerQuery)) {
            score += 10;
          }
          
          // Count content matches
          const contentMatches = (lowerContent.match(new RegExp(lowerQuery, 'g')) || []).length;
          score += contentMatches;
          
          if (score > 0) {
            // Create snippet around first match
            const matchIndex = lowerContent.indexOf(lowerQuery);
            const start = Math.max(0, matchIndex - 100);
            const end = Math.min(content.length, matchIndex + 200);
            const snippet = content.substring(start, end).trim();
            
            results.push({
              path: file.path,
              name: file.name,
              snippet: snippet || content.substring(0, 200) + '...',
              score,
            });
          }
        } catch (error) {
          console.error(`Error processing file ${file.path}:`, error);
        }
      }

      // Sort by score and limit results
      results.sort((a, b) => b.score - a.score);
      const limitedResults = results.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: `Found ${limitedResults.length} notes matching "${query}":\n\n` +
              limitedResults.map(result => 
                `**${result.name}** (${result.path})\n` +
                `Score: ${result.score}\n` +
                `Snippet: ${result.snippet}\n\n`
              ).join(''),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search failed: ${error}`);
    }
  }

  private async getNote(params: z.infer<typeof GetNoteSchema>) {
    const { path } = params;
    
    try {
      const content = await this.getFileContent(path);
      
      return {
        content: [
          {
            type: "text",
            text: `# ${path}\n\n${content}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get note: ${error}`);
    }
  }

  private async listNotes(params: z.infer<typeof ListNotesSchema>) {
    const { folder } = params;
    
    try {
      const contents = await this.getRepoContents(folder || "");
      const notes = contents.filter(item => item.type === 'file' && item.name.endsWith('.md'));
      const folders = contents.filter(item => item.type === 'dir');
      
      let result = `## Notes in ${folder || 'root'}\n\n`;
      
      if (folders.length > 0) {
        result += `### Folders:\n`;
        folders.forEach(folder => {
          result += `- 📁 ${folder.name}\n`;
        });
        result += '\n';
      }
      
      if (notes.length > 0) {
        result += `### Notes:\n`;
        notes.forEach(note => {
          const notePath = folder ? `${folder}/${note.name}` : note.name;
          result += `- 📝 ${note.name} (${notePath})\n`;
        });
      } else {
        result += 'No notes found in this folder.\n';
      }
      
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to list notes: ${error}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Obsidian GitHub MCP Server running on stdio");
  }
}

// Run the server
const server = new ObsidianMCPServer();
server.run().catch(console.error);