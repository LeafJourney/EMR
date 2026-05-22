import { z } from "zod";

const LINEAR_API_URL = "https://api.linear.app/graphql";

const linearCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable().optional(),
  }).nullable().optional(),
});

const linearIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  url: z.string().optional(),
  state: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
  }).nullable().optional(),
  project: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable().optional(),
  comments: z.object({
    nodes: z.array(linearCommentSchema),
  }).optional(),
});

const linearIssueResponseSchema = z.object({
  issue: linearIssueSchema.nullable(),
});

export type LinearIssue = z.infer<typeof linearIssueSchema>;
export type LinearComment = z.infer<typeof linearCommentSchema>;

interface LinearGraphQLError {
  message: string;
}

interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: LinearGraphQLError[];
}

function getLinearApiKey(): string {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY is not configured");
  }
  return apiKey;
}

async function linearGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = getLinearApiKey();
  const authHeader = apiKey.startsWith("lin_api_") ? apiKey : `Bearer ${apiKey}`;

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Linear API request failed (${response.status})`);
  }

  const json = (await response.json()) as LinearGraphQLResponse<T>;

  if (json.errors?.length) {
    throw new Error(`Linear API error: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  if (!json.data) {
    throw new Error("Linear API returned no data");
  }

  return json.data;
}

const ISSUE_BY_IDENTIFIER_QUERY = `
  query IssueByIdentifier($identifier: String!) {
    issue(id: $identifier) {
      id
      identifier
      title
      description
      url
      state {
        id
        name
        type
      }
      project {
        id
        name
      }
      comments(first: 100) {
        nodes {
          id
          body
          createdAt
          user {
            id
            name
          }
        }
      }
    }
  }
`;

export async function getLinearIssue(identifier: string): Promise<LinearIssue | null> {
  const data = await linearGraphQL<unknown>(ISSUE_BY_IDENTIFIER_QUERY, { identifier });
  const parsed = linearIssueResponseSchema.parse(data);
  return parsed.issue;
}

export function findCodexAgentBriefComment(issue: LinearIssue): LinearComment | null {
  const comments = issue.comments?.nodes ?? [];
  const match = comments.find((comment) => {
    const body = comment.body.trim();
    return /codex\s+agent\s+brief/i.test(body) || /^#\s*agent\s+brief/im.test(body);
  });

  return match ?? null;
}
