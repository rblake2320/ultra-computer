import { createServer, type Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  blockIdentityRequest,
  unblockIdentityPath,
  verificationApprovalBody,
  verificationRejectionBody,
} from "../../client/src/lib/identityApiContract";
import { registerIdentityRoutes } from "../../server/identityRoutes";

describe("Identity client/server route contract", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerIdentityRoutes(app);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function register(label: string): Promise<string> {
    const response = await post("/api/identity/register", {
      displayName: `${label}-${crypto.randomUUID()}`,
    });
    expect(response.status).toBe(201);
    const identity = (await response.json()) as { cryptoId: string };
    return identity.cryptoId;
  }

  it("accepts reviewer data supplied by approval and rejection clients", async () => {
    const reviewerId = await register("Reviewer");
    const approvedId = await register("Approved");
    const approvedRequest = await post(`/api/identity/${approvedId}/verify`, {
      method: "email",
      evidence: "approved@example.test",
      requestedTier: "verified",
    });
    const { id: approvalRequestId } = (await approvedRequest.json()) as { id: string };

    const approval = await post(
      `/api/identity/verifications/${approvalRequestId}/approve`,
      verificationApprovalBody(reviewerId),
    );
    expect(approval.status).toBe(200);

    const rejectedId = await register("Rejected");
    const rejectedRequest = await post(`/api/identity/${rejectedId}/verify`, {
      method: "email",
      evidence: "rejected@example.test",
      requestedTier: "verified",
    });
    const { id: rejectionRequestId } = (await rejectedRequest.json()) as { id: string };
    const rejection = await post(
      `/api/identity/verifications/${rejectionRequestId}/reject`,
      verificationRejectionBody(reviewerId, "insufficient evidence"),
    );
    expect(rejection.status).toBe(200);
    await expect(rejection.json()).resolves.toMatchObject({
      id: rejectionRequestId,
      reviewedBy: reviewerId,
      rejectionReason: "insufficient evidence",
      status: "rejected",
    });
  });

  it("uses the block route, body, list shape, and unblock identifier expected by the server", async () => {
    const blockerId = await register("Blocker");
    const blockedId = await register("Blocked");
    const request = blockIdentityRequest(blockerId, blockedId, "abuse");

    const blockResponse = await post(request.path, request.body);
    expect(blockResponse.status).toBe(201);
    await expect(blockResponse.json()).resolves.toMatchObject({ blockerId, blockedId, reason: "abuse" });

    const listResponse = await fetch(`${baseUrl}/api/identity/${blockerId}/blocks`);
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({ blockerId, blockedId, reason: "abuse" }),
    ]);

    const unblockResponse = await fetch(`${baseUrl}${unblockIdentityPath(blockerId, blockedId)}`, {
      method: "DELETE",
    });
    expect(unblockResponse.status).toBe(200);

    const emptyListResponse = await fetch(`${baseUrl}/api/identity/${blockerId}/blocks`);
    await expect(emptyListResponse.json()).resolves.toEqual([]);
  });
});
