export const ADDABLE_MESSAGING_CHANNEL_TYPES = ["slack", "gmail", "webhook"] as const;

export type AddableMessagingChannelType = (typeof ADDABLE_MESSAGING_CHANNEL_TYPES)[number];
export type MessagingChannelAction = "test" | "connect" | "disconnect";

interface ChannelActionResult {
  ok: boolean;
  error?: string;
}

type ApiRequest = <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>;

function isChannelActionResult(value: unknown): value is ChannelActionResult {
  return typeof value === "object"
    && value !== null
    && typeof (value as { ok?: unknown }).ok === "boolean";
}

export async function performMessagingChannelAction(
  request: ApiRequest,
  channelId: string,
  action: MessagingChannelAction,
): Promise<ChannelActionResult> {
  const result = await request<unknown>(
    "POST",
    `/api/messaging/channels/${encodeURIComponent(channelId)}/${action}`,
  );

  if (!isChannelActionResult(result)) {
    throw new Error(`Channel ${action} returned an invalid response`);
  }
  if (!result.ok) {
    throw new Error(result.error?.trim() || `Channel ${action} failed`);
  }

  return result;
}
