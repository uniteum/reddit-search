import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const USER_AGENT = "reddit-search-mcp/1.0.0";

interface RedditPost {
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  url: string;
  is_self: boolean;
}

interface RedditComment {
  body: string;
  author: string;
  score: number;
  created_utc: number;
  permalink: string;
}

async function redditFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Reddit API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

function formatDate(utc: number): string {
  return new Date(utc * 1000).toISOString().slice(0, 10);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

const server = new McpServer({
  name: "reddit-search",
  version: "1.0.0",
});

server.registerTool(
  "search",
  {
    description:
      "Search Reddit posts. Returns titles, scores, comment counts, and URLs.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .max(512)
        .describe("Search query. Use subreddit:NAME to limit to a subreddit."),
      sort: z
        .enum(["relevance", "hot", "top", "new", "comments"])
        .default("relevance")
        .describe("Sort order (default: relevance)"),
      time: z
        .enum(["hour", "day", "week", "month", "year", "all"])
        .default("week")
        .describe("Time filter (default: week)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe("Number of results (1-100, default 10)"),
    },
  },
  async ({ query, sort, time, limit }) => {
    // Extract subreddit: prefix if present
    let subreddit = "";
    let searchQuery = query;
    const match = query.match(/^subreddit:(\S+)\s*(.*)/);
    if (match) {
      subreddit = match[1];
      searchQuery = match[2] || "";
    }

    const params = new URLSearchParams({
      q: searchQuery,
      sort,
      t: time,
      limit: String(limit),
      restrict_sr: subreddit ? "true" : "false",
    });

    const base = subreddit
      ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json`
      : "https://www.reddit.com/search.json";

    const data = (await redditFetch(`${base}?${params}`)) as {
      data: { children: Array<{ data: RedditPost }> };
    };

    const posts = data.data.children.map(({ data: post }) => {
      const selftext = post.selftext
        ? `\n${truncate(post.selftext, 300)}`
        : "";
      return [
        `${post.title}`,
        `r/${post.subreddit} · u/${post.author} · ${formatDate(post.created_utc)}`,
        `▲ ${post.score}  💬 ${post.num_comments}${selftext}`,
        `https://reddit.com${post.permalink}`,
        "---",
      ].join("\n");
    });

    if (posts.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No posts found." }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${posts.length} posts:\n\n${posts.join("\n")}`,
        },
      ],
    };
  },
);

server.registerTool(
  "subreddit_posts",
  {
    description:
      "Get recent posts from a specific subreddit. Returns titles, scores, and URLs.",
    inputSchema: {
      subreddit: z
        .string()
        .min(1)
        .max(50)
        .describe("Subreddit name (without r/ prefix)"),
      sort: z
        .enum(["hot", "new", "top", "rising"])
        .default("hot")
        .describe("Sort order (default: hot)"),
      time: z
        .enum(["hour", "day", "week", "month", "year", "all"])
        .default("week")
        .describe("Time filter for 'top' sort (default: week)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe("Number of results (1-100, default 10)"),
    },
  },
  async ({ subreddit, sort, time, limit }) => {
    const params = new URLSearchParams({
      t: time,
      limit: String(limit),
    });

    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}.json?${params}`;
    const data = (await redditFetch(url)) as {
      data: { children: Array<{ data: RedditPost }> };
    };

    const posts = data.data.children.map(({ data: post }) => {
      const selftext = post.selftext
        ? `\n${truncate(post.selftext, 300)}`
        : "";
      return [
        `${post.title}`,
        `u/${post.author} · ${formatDate(post.created_utc)}`,
        `▲ ${post.score}  💬 ${post.num_comments}${selftext}`,
        `https://reddit.com${post.permalink}`,
        "---",
      ].join("\n");
    });

    if (posts.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No posts found in r/${subreddit}.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `r/${subreddit} (${sort}):\n\n${posts.join("\n")}`,
        },
      ],
    };
  },
);

server.registerTool(
  "post_comments",
  {
    description:
      "Get comments from a specific Reddit post by its URL or permalink.",
    inputSchema: {
      url: z
        .string()
        .min(1)
        .describe(
          "Reddit post URL or permalink (e.g. /r/defi/comments/abc123/title/)",
        ),
      sort: z
        .enum(["confidence", "top", "new", "controversial", "old", "qa"])
        .default("top")
        .describe("Comment sort order (default: top)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of top-level comments (1-100, default 20)"),
    },
  },
  async ({ url, sort, limit }) => {
    // Normalize to permalink path
    let permalink = url;
    const urlMatch = url.match(
      /reddit\.com(\/r\/[^?#]+)/,
    );
    if (urlMatch) {
      permalink = urlMatch[1];
    }
    // Ensure trailing slash
    if (!permalink.endsWith("/")) permalink += "/";

    const params = new URLSearchParams({
      sort,
      limit: String(limit),
    });

    const fetchUrl = `https://www.reddit.com${permalink}.json?${params}`;
    const data = (await redditFetch(fetchUrl)) as Array<{
      data: { children: Array<{ kind: string; data: RedditComment }> };
    }>;

    // First element is the post, second is comments
    const comments = data[1].data.children
      .filter((c) => c.kind === "t1")
      .map(({ data: comment }) => {
        return [
          `u/${comment.author} · ${formatDate(comment.created_utc)} · ▲ ${comment.score}`,
          truncate(comment.body, 500),
          "---",
        ].join("\n");
      });

    if (comments.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No comments found." }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `${comments.length} comments:\n\n${comments.join("\n")}`,
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("reddit-search MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
