import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, createAgentIssue, issueProject, listAgentIssues } from "@/lib/agent-api/issues";

/** GET ?projectId=&status=&severity=&platform=&area=&assignee=&stage=&cursor=&limit= */
export async function GET(request: NextRequest) {
  return agentIssueRequest(request, "issues.list", "observer", null, async (agent) => {
    try {
      const scope = await issueProject(agent, request.nextUrl.searchParams);
      const result = await listAgentIssues(scope, request.nextUrl.searchParams);
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof Error && error.name === "IssuePageSizeError") {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      throw error;
    }
  });
}

/** POST JSON with title, description. The reporter/beneficiary is always the agent's owner (#494).
 * Supply projectId in query or body and Idempotency-Key in headers.
 * Optional categoryId, typeId, proofLinks (newline-separated GitHub URLs), acknowledgeSimilar.
 * Client severity is ignored; status and assignment cannot be set here.
 */
export async function POST(request: NextRequest) {
  return agentIssueRequest(request, "issues.create", "contributor", null,
    (agent) => createAgentIssue(agent, request));
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "POST", "OPTIONS"]);
const apiOptions = createOptions(["GET", "HEAD", "POST", "OPTIONS"]);
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
