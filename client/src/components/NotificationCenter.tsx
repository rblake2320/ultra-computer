import { useEffect, useRef, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { connectEventSource } from "@/lib/queryClient";
import type { Conversation } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType = "success" | "error" | "info";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  conversationId: string;
}

const MAX_NOTIFICATIONS = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function typeColor(type: NotificationType): string {
  switch (type) {
    case "success": return "text-green-600 dark:text-green-400";
    case "error":   return "text-red-600 dark:text-red-400";
    default:        return "text-blue-600 dark:text-blue-400";
  }
}

function typeBg(type: NotificationType): string {
  switch (type) {
    case "success": return "bg-green-50 dark:bg-green-950/30";
    case "error":   return "bg-red-50 dark:bg-red-950/30";
    default:        return "bg-blue-50 dark:bg-blue-950/30";
  }
}

// ─── SSE listener hook ────────────────────────────────────────────────────────

function useConversationSSE(
  conversationIds: string[],
  onEvent: (convId: string, event: any) => void
) {
  const connections = useRef<Map<string, () => void>>(new Map());
  // Ref always holds the latest onEvent callback — prevents stale closure inside the effect
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const activeIds = new Set(conversationIds);

    // Remove connections for convs no longer active
    for (const [id, disconnect] of Array.from(connections.current.entries())) {
      if (!activeIds.has(id)) {
        disconnect();
        connections.current.delete(id);
      }
    }

    // Open new connections
    for (const id of conversationIds) {
      if (!connections.current.has(id)) {
        const disconnect = connectEventSource(
          `/api/conversations/${id}/stream`,
          {
            onMessage: (e) => {
            try {
              const data = JSON.parse(e.data);
              onEventRef.current(id, data);
            } catch {
              /* ignore malformed */
            }
            },
          },
        );
        connections.current.set(id, disconnect);
      }
    }

    return () => {
      // Cleanup on unmount
      for (const disconnect of Array.from(connections.current.values())) disconnect();
      connections.current.clear();
    };
  }, [conversationIds.join(",")]);
}

// ─── NotificationCenter ───────────────────────────────────────────────────────

export function NotificationCenter(): JSX.Element {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  // Fetch all conversations to know which SSE streams to subscribe to
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    refetchInterval: 30_000,
  });

  // Only subscribe to conversations that are actively running or recently updated
  const activeConvIds = conversations
    .filter(c => c.status === "running" || c.status === "planning" ||
                 (Date.now() - c.updatedAt < 5 * 60 * 1000)) // updated in last 5 min
    .map(c => c.id);

  const addNotification = useCallback((notif: Omit<Notification, "id" | "read">) => {
    setNotifications(prev => {
      const newNotif: Notification = {
        ...notif,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        read: false,
      };
      // Prepend and cap at MAX_NOTIFICATIONS
      return [newNotif, ...prev].slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  // Handle incoming SSE events
  const handleSSEEvent = useCallback(
    (convId: string, event: any) => {
      const conv = conversations.find(c => c.id === convId);
      const sessionLabel = conv?.title ?? `Session ${convId.slice(0, 8)}`;

      switch (event.type) {
        case "agent_complete": {
          const taskTitle = event.task?.title ?? "Task";
          addNotification({
            type: "success",
            title: `Task completed`,
            body: `${taskTitle} — ${sessionLabel}`,
            timestamp: Date.now(),
            conversationId: convId,
          });
          break;
        }
        case "error": {
          const errMsg =
            typeof event.error === "string"
              ? event.error.slice(0, 120)
              : "An error occurred";
          addNotification({
            type: "error",
            title: `Error in task`,
            body: `${errMsg} — ${sessionLabel}`,
            timestamp: Date.now(),
            conversationId: convId,
          });
          break;
        }
        case "task_complete": {
          const title = event.task?.title ?? "Subtask";
          addNotification({
            type: "success",
            title: `Task complete`,
            body: `${title} — ${sessionLabel}`,
            timestamp: Date.now(),
            conversationId: convId,
          });
          break;
        }
        case "complete": {
          addNotification({
            type: "success",
            title: `Session finished`,
            body: sessionLabel,
            timestamp: Date.now(),
            conversationId: convId,
          });
          break;
        }
        default:
          break;
      }
    },
    [conversations, addNotification]
  );

  useConversationSSE(activeConvIds, handleSSEEvent);

  // Mark all as read when dropdown opens
  useEffect(() => {
    if (open) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  }, [open]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          data-testid="button-notification-bell"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 text-[10px] flex items-center justify-center pointer-events-none"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0"
        data-testid="panel-notifications"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setNotifications([])}
              data-testid="button-clear-notifications"
            >
              Clear all
            </Button>
          )}
        </div>

        <Separator />

        {/* Notification list */}
        {notifications.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 text-muted-foreground"
            data-testid="text-no-notifications"
          >
            <Bell className="h-6 w-6 mb-2 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <ul role="list" className="divide-y divide-border">
              {notifications.map((notif) => (
                <li
                  key={notif.id}
                  className={`px-4 py-3 transition-colors ${
                    !notif.read ? typeBg(notif.type) : ""
                  }`}
                  data-testid={`notification-item-${notif.id}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold truncate ${typeColor(notif.type)}`}
                        data-testid={`text-notif-title-${notif.id}`}
                      >
                        {notif.title}
                      </p>
                      <p
                        className="text-sm text-foreground mt-0.5 leading-snug line-clamp-2"
                        data-testid={`text-notif-body-${notif.id}`}
                      >
                        {notif.body}
                      </p>
                      <p
                        className="text-[11px] text-muted-foreground mt-1"
                        data-testid={`text-notif-time-${notif.id}`}
                      >
                        {formatRelative(notif.timestamp)}
                      </p>
                    </div>
                    {!notif.read && (
                      <span className="mt-1 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
