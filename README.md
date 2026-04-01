# reddit-search

MCP server for searching Reddit. No API key required.

## Tools

### search

Search Reddit posts globally or within a subreddit.

- **query** — Search query. Use `subreddit:NAME` prefix to limit to a subreddit.
- **sort** — Sort order: `relevance`, `hot`, `top`, `new`, `comments` (default: relevance).
- **time** — Time filter: `hour`, `day`, `week`, `month`, `year`, `all` (default: week).
- **limit** — Number of results (1–100, default 10).

### subreddit_posts

Get recent posts from a specific subreddit.

- **subreddit** — Subreddit name (without r/ prefix).
- **sort** — Sort order: `hot`, `new`, `top`, `rising` (default: hot).
- **time** — Time filter for `top` sort (default: week).
- **limit** — Number of results (1–100, default 10).

### post_comments

Get comments from a specific Reddit post.

- **url** — Reddit post URL or permalink.
- **sort** — Comment sort: `confidence`, `top`, `new`, `controversial`, `old`, `qa` (default: top).
- **limit** — Number of top-level comments (1–100, default 20).

## Setup

```bash
npm install
```

No API key needed. Uses Reddit's public JSON endpoints (~10 requests/minute).

## Usage

```bash
npm start
```

The server runs on stdio using the [Model Context Protocol](https://modelcontextprotocol.io).

### MCP configuration

Add to your `.mcp.json`:

```json
"reddit-search": {
  "command": "npx",
  "args": ["tsx", "src/index.ts"],
  "cwd": "/path/to/reddit-search"
}
```
