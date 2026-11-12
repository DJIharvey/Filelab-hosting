
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const REPO = process.env.GITHUB_REPO || "DJIharvey/Filelab-hosting";
const BRANCH = process.env.GITHUB_BRANCH || "ai-work";

const sessions = new Map();

async function github(path) {
  const response = await fetch(
    `https://api.github.com/repos/${REPO}/${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "FileLab-AI-Bridge"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }

  return response.json();
}

function createServer() {
  const server = new McpServer({
    name: "filelab-ai-bridge",
    version: "1.0.0"
  });

  server.tool(
    "filelab_status",
    "Check the FileLab repository and connected branch.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({
          project: "FileLab",
          repository: REPO,
          branch: BRANCH,
          connection: "Connected",
          permissions: "Read-only"
        }, null, 2)
      }]
    })
  );

  server.tool(
    "filelab_list_files",
    "List files in the FileLab repository.",
    {},
    async () => {
      const tree = await github(
        `git/trees/${encodeURIComponent(BRANCH)}?recursive=1`
      );

      const files = tree.tree
        .filter(item => item.type === "blob")
        .map(item => item.path);

      return {
        content: [{
          type: "text",
          text: files.join("\n") || "No files found."
        }]
      };
    }
  );

  server.tool(
    "filelab_read_file",
    "Read a source file from the FileLab repository.",
    {
      path: z.string().min(1).max(300)
    },
    async ({ path }) => {
      if (
        path.startsWith("/") ||
        path.includes("..") ||
        path.includes("\\")
      ) {
        throw new Error("Invalid file path.");
      }

      const encodedPath = path
        .split("/")
        .map(encodeURIComponent)
        .join("/");

      const file = await github(
        `contents/${encodedPath}?ref=${encodeURIComponent(BRANCH)}`
      );

      if (!file.content || file.encoding !== "base64") {
        throw new Error("File is not available as a text file.");
      }

      const content = Buffer
        .from(file.content, "base64")
        .toString("utf8");

      return {
        content: [{
          type: "text",
          text: content.slice(0, 50000)
        }]
      };
    }
  );

  return server;
}

app.get("/", (_req, res) => {
  res.send("FileLab AI Bridge is running.");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "FileLab AI Bridge" });
});

app.get("/sse", async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;

  sessions.set(sessionId, transport);

  transport.onclose = () => {
    sessions.delete(sessionId);
  };

  try {
    await createServer().connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    console.error("MCP connection error:", error);
    if (!res.headersSent) res.status(500).end();
  }
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;

  if (typeof sessionId !== "string") {
    return res.status(400).send("Missing session ID.");
  }

  const transport = sessions.get(sessionId);

  if (!transport) {
    return res.status(404).send("Session not found.");
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error("MCP message error:", error);
    if (!res.headersSent) res.status(500).end();
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FileLab AI Bridge listening on ${PORT}`);
});
