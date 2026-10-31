import { createClient } from "@supabase/supabase-js";

const SOURCE = "groupme";
const GROUPME_API = "https://api.groupme.com/v3";
const MAX_MESSAGES = 20;
const MAX_THREAD_MESSAGES = 4;
const THREAD_WINDOW_SECONDS = 10 * 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type GroupMeMessage = {
  id: string;
  created_at?: number | string;
  text?: string | null;
  sender_type?: string | null;
  sender_id?: string | null;
  user_id?: string | null;
  name?: string | null;
  system?: boolean;
};

type Cursor = {
  last_id: string;
  read_count: number;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseUrl(): string {
  return Deno.env.get("SUPABASE_URL")?.trim() ?? "";
}

function getServiceKey(): string {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      const defaultEntry = parsed?.default;
      if (typeof defaultEntry === "string" && defaultEntry.trim()) {
        return defaultEntry.trim();
      }
      if (typeof defaultEntry?.key === "string" && defaultEntry.key.trim()) {
        return defaultEntry.key.trim();
      }
    } catch {
      // Fall back to the legacy environment variable below.
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceKey();
  if (!url || !key) {
    throw new Error("The Supabase server connection is not configured.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getGroupMeToken(): string {
  return Deno.env.get("GROUPME_TOKEN")?.trim() ?? "";
}

function getGroupMeGroupId(): string {
  return Deno.env.get("GROUPME_GROUP_ID")?.trim() ?? "";
}

function getGroupMeBotId(): string {
  return Deno.env.get("GROUPME_BOT_ID")?.trim() ?? "";
}

function messageText(message: GroupMeMessage): string {
  return typeof message.text === "string" ? message.text.trim() : "";
}

function messageTime(message: GroupMeMessage): number {
  const value = typeof message.created_at === "string"
    ? Number(message.created_at)
    : message.created_at;
  return Number.isFinite(value) ? Number(value) : 0;
}

function messageId(message: GroupMeMessage): string {
  return typeof message.id === "string" ? message.id : String(message.id ?? "");
}

function compareMessages(left: GroupMeMessage, right: GroupMeMessage): number {
  const timeDifference = messageTime(left) - messageTime(right);
  if (timeDifference !== 0) return timeDifference;
  return messageId(left).localeCompare(messageId(right));
}

function sortOldestFirst(messages: GroupMeMessage[]): GroupMeMessage[] {
  return [...messages].sort(compareMessages);
}

function sameSender(left: GroupMeMessage, right: GroupMeMessage): boolean {
  const leftId = left.sender_id || left.user_id || "";
  const rightId = right.sender_id || right.user_id || "";
  if (leftId && rightId) return leftId === rightId;
  return Boolean(left.name && right.name && left.name === right.name);
}

function isSkippedMessage(message: GroupMeMessage): boolean {
  return message.sender_type === "bot" || message.sender_type === "system" || message.system === true;
}

async function groupMeFetch(path: string, init: RequestInit = {}): Promise<{ response: unknown; status: number }> {
  const token = getGroupMeToken();
  if (!token) throw new Error("GROUPME_TOKEN is not configured in Supabase Secrets.");

  const headers = new Headers(init.headers);
  headers.set("X-Access-Token", token);
  const response = await fetch(`${GROUPME_API}${path}`, { ...init, headers });
  if (response.status === 304) return { response: null, status: 304 };

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    console.error("GroupMe request failed", response.status, payload);
    throw new Error("GroupMe could not be reached.");
  }
  return { response: payload, status: response.status };
}

function extractMessages(payload: unknown): GroupMeMessage[] {
  if (!payload || typeof payload !== "object") return [];
  const response = (payload as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return [];
  const messages = (response as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return [];
  return messages.filter((message): message is GroupMeMessage => {
    return Boolean(message && typeof message === "object" && "id" in message);
  });
}

function extractGroupName(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const response = (payload as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return "";
  const name = (response as Record<string, unknown>).name;
  return typeof name === "string" ? name.trim() : "";
}

async function fetchGroupMessages(afterId = ""): Promise<{ messages: GroupMeMessage[]; notModified: boolean }> {
  const params = new URLSearchParams({ limit: String(MAX_MESSAGES) });
  if (afterId) params.set("after_id", afterId);
  const result = await groupMeFetch(`/groups/${encodeURIComponent(getGroupMeGroupId())}/messages?${params}`);
  return { messages: extractMessages(result.response), notModified: result.status === 304 };
}

async function fetchEarlierMessages(message: GroupMeMessage): Promise<GroupMeMessage[]> {
  const beforeId = messageId(message);
  if (!beforeId) return [];
  const params = new URLSearchParams({ before_id: beforeId, limit: String(MAX_MESSAGES) });
  const result = await groupMeFetch(`/groups/${encodeURIComponent(getGroupMeGroupId())}/messages?${params}`);
  const currentTime = messageTime(message);
  const earliestTime = currentTime - THREAD_WINDOW_SECONDS;
  return sortOldestFirst(extractMessages(result.response))
    .filter((earlier) => {
      const earlierTime = messageTime(earlier);
      return earlierTime >= earliestTime && earlierTime < currentTime && sameSender(earlier, message) && !isSkippedMessage(earlier) && Boolean(messageText(earlier));
    })
    .slice(-MAX_THREAD_MESSAGES);
}

async function readCursor(supabase: ReturnType<typeof getAdminClient>): Promise<Cursor> {
  const { data, error } = await supabase
    .from("channel_cursor")
    .select("last_id, read_count")
    .eq("source", SOURCE)
    .maybeSingle();
  if (error) throw new Error("The database could not read the GroupMe bookmark.");
  return {
    last_id: typeof data?.last_id === "string" ? data.last_id : "",
    read_count: Number.isFinite(data?.read_count) ? Number(data.read_count) : 0,
  };
}

async function writeCursor(supabase: ReturnType<typeof getAdminClient>, lastId: string, readCount: number): Promise<void> {
  const { error } = await supabase.from("channel_cursor").upsert({
    source: SOURCE,
    last_id: lastId,
    read_count: readCount,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("The database could not save the GroupMe bookmark.");
}

async function getGroupName(): Promise<string> {
  const result = await groupMeFetch(`/groups/${encodeURIComponent(getGroupMeGroupId())}`);
  return extractGroupName(result.response) || "GroupMe group";
}

function getReaderApiKey(): string {
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() ?? "";
}

function threadPayload(messages: GroupMeMessage[]): string[] {
  return sortOldestFirst(messages).map(messageText).filter(Boolean);
}

async function sendToAgent(message: GroupMeMessage, sourceName: string, thread: string[]): Promise<Record<string, unknown>> {
  const url = getSupabaseUrl();
  if (!url) throw new Error("SUPABASE_URL is not configured.");
  const headers = new Headers({ "Content-Type": "application/json" });
  const apiKey = getReaderApiKey();
  if (apiKey) headers.set("apikey", apiKey);
  const response = await fetch(`${url}/functions/v1/submit-event`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      announcement: messageText(message),
      source: SOURCE,
      source_id: messageId(message),
      source_name: sourceName,
      thread,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("The event agent could not process the GroupMe post.");
  }
  return payload as Record<string, unknown>;
}

function decisionText(decision: Record<string, unknown>): string {
  const message = typeof decision.message === "string" ? decision.message.trim() : "The post was checked.";
  const reasons = Array.isArray(decision.reasons)
    ? decision.reasons.filter((reason): reason is string => typeof reason === "string" && Boolean(reason.trim()))
    : [];
  const suffix = reasons.length ? ` ${reasons.join(" ")}` : "";
  return `Event Radar: ${message}${suffix}`.slice(0, 1000);
}

async function replyInGroupMe(text: string): Promise<void> {
  const botId = getGroupMeBotId();
  if (!botId) return;
  const response = await fetch(`${GROUPME_API}/bots/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_id: botId, text }),
  });
  if (!response.ok) {
    console.error("GroupMe bot reply failed", response.status);
  }
}

async function checkGroupMe(): Promise<Record<string, unknown>> {
  if (!getGroupMeToken() || !getGroupMeGroupId()) {
    return { ok: false, message: "GROUPME_TOKEN and GROUPME_GROUP_ID are not configured in Supabase Secrets." };
  }
  try {
    const result = await groupMeFetch(`/groups/${encodeURIComponent(getGroupMeGroupId())}`);
    const groupName = extractGroupName(result.response);
    return { ok: true, message: groupName ? "The GroupMe token and group work." : "The GroupMe group responded." };
  } catch {
    return { ok: false, message: "The GroupMe token or group could not be checked." };
  }
}

async function handleGet(request: Request): Promise<Response> {
  const supabase = getAdminClient();
  const cursor = await readCursor(supabase);
  const check = new URL(request.url).searchParams.get("check");
  const ready = Boolean(getGroupMeToken() && getGroupMeGroupId());
  const body: Record<string, unknown> = {
    ok: true,
    ready,
    last_message_id: cursor.last_id,
    read_count: cursor.read_count,
    bot: Boolean(getGroupMeBotId()),
  };
  if (check === "groupme") body.check = await checkGroupMe();
  return jsonResponse(body);
}

async function handlePost(): Promise<Response> {
  if (!getGroupMeToken() || !getGroupMeGroupId()) {
    return jsonResponse({ ok: false, message: "GROUPME_TOKEN and GROUPME_GROUP_ID are not configured in Supabase Secrets." }, 503);
  }

  const supabase = getAdminClient();
  const cursor = await readCursor(supabase);
  const fetched = await fetchGroupMessages(cursor.last_id);
  if (fetched.notModified || fetched.messages.length === 0) {
    return jsonResponse({ ok: true, last_message_id: cursor.last_id, read_count: cursor.read_count, processed: 0 });
  }

  const messages = sortOldestFirst(fetched.messages);
  if (!cursor.last_id) {
    const newest = messages[messages.length - 1];
    await writeCursor(supabase, messageId(newest), cursor.read_count);
    return jsonResponse({ ok: true, initialized: true, last_message_id: messageId(newest), read_count: cursor.read_count, processed: 0 });
  }

  const sourceName = await getGroupName();
  let lastId = cursor.last_id;
  let readCount = cursor.read_count;
  let processed = 0;

  for (const message of messages) {
    const currentId = messageId(message);
    if (!currentId) continue;
    try {
      if (!isSkippedMessage(message) && messageText(message)) {
        const earlier = await fetchEarlierMessages(message);
        const decision = await sendToAgent(message, sourceName, threadPayload(earlier));
        if (decision.already_read !== true) {
          await replyInGroupMe(decisionText(decision));
        }
        processed += 1;
      }
    } catch (error) {
      console.error("Could not process GroupMe message", currentId, error);
    } finally {
      lastId = currentId;
      readCount += 1;
      await writeCursor(supabase, lastId, readCount);
    }
  }

  return jsonResponse({ ok: true, last_message_id: lastId, read_count: readCount, processed });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (request.method === "GET") return await handleGet(request);
    if (request.method === "POST") return await handlePost();
    return jsonResponse({ ok: false, message: "Use GET to check the reader or POST to read GroupMe." }, 405);
  } catch (error) {
    console.error("read-channel failed", error);
    const message = error instanceof Error ? error.message : "The GroupMe reader could not run.";
    return jsonResponse({ ok: false, message }, 500);
  }
});
