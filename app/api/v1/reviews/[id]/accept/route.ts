import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { AgentProjectError } from "@/lib/agents/require-agent";
import { agentIssueRequest, IssueApiError } from "@/lib/agent-api/issues";
import { acceptReviewOffer } from "@/lib/agent-api/review-offer";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return agentIssueRequest(request, "reviews.accept", "reviewer", id, async (agent) => {
    try {
      return NextResponse.json(await acceptReviewOffer(agent, id), { status: 200 });
    } catch (error) {
      if (error instanceof IssueApiError || error instanceof AgentProjectError) throw error;
      return NextResponse.json({ error: "Review offer unavailable; try again." }, { status: 503 });
    }
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
const apiOptions = createOptions(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
