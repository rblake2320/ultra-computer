export interface IdentityBlockRecord {
  id: string;
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: number;
}

export function verificationApprovalBody(reviewerId: string): { reviewerId: string } {
  return { reviewerId };
}

export function verificationRejectionBody(
  reviewerId: string,
  reason: string,
): { reviewerId: string; reason: string } {
  return { reviewerId, reason };
}

export function blockIdentityRequest(
  blockerId: string,
  blockedId: string,
  reason?: string,
): { path: string; body: { blockedId: string; reason?: string } } {
  return {
    path: `/api/identity/${blockerId}/block`,
    body: reason ? { blockedId, reason } : { blockedId },
  };
}

export function unblockIdentityPath(blockerId: string, blockedId: string): string {
  return `/api/identity/${blockerId}/blocks/${blockedId}`;
}
