import { describe, expect, it } from "vitest";
import {
  blockIdentityRequest,
  unblockIdentityPath,
  verificationApprovalBody,
  verificationRejectionBody,
} from "../../client/src/lib/identityApiContract";

describe("Identity API client contract", () => {
  it("includes the current identity as reviewer for approval and rejection", () => {
    expect(verificationApprovalBody("reviewer-1")).toEqual({ reviewerId: "reviewer-1" });
    expect(verificationRejectionBody("reviewer-1", "insufficient evidence")).toEqual({
      reviewerId: "reviewer-1",
      reason: "insufficient evidence",
    });
  });

  it("targets the server block route with the server field names", () => {
    expect(blockIdentityRequest("blocker-1", "blocked-1", "spam")).toEqual({
      path: "/api/identity/blocker-1/block",
      body: { blockedId: "blocked-1", reason: "spam" },
    });
    expect(blockIdentityRequest("blocker-1", "blocked-1")).toEqual({
      path: "/api/identity/blocker-1/block",
      body: { blockedId: "blocked-1" },
    });
  });

  it("unblocks by the target identity ID expected by the server", () => {
    expect(unblockIdentityPath("blocker-1", "blocked-1")).toBe(
      "/api/identity/blocker-1/blocks/blocked-1",
    );
  });
});
