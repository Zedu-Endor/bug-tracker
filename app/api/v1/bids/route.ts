import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueProject } from "@/lib/agent-api/issues";
import { listCallerOpenBids, parseBidScope } from "@/lib/agent-api/my-bids";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";

/** GET ?projectId=&scope=agent|owner — the caller's open bids (#639). */
export async function GET(request: NextRequest) {
  return agentIssueRequest(request, "bids.list", "observer", null, async (agent) => {
    const scope = await issueProject(agent, request.nextUrl.searchParams);
    const bidScope = parseBidScope(request.nextUrl.searchParams.get("scope"));
    return NextResponse.json({ bids: await listCallerOpenBids(agent, scope.projectId, bidScope) });
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "OPTIONS"]);
const apiOptions = createOptions(["GET", "HEAD", "OPTIONS"]);
export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
