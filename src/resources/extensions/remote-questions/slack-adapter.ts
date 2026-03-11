/**
 * Remote Questions — Slack adapter
 *
 * Uses Slack Bot Token API (xoxb-*) for bidirectional messaging:
 * - Send: POST chat.postMessage with Block Kit
 * - Poll: GET conversations.replies to read thread responses
 */

import type {
  ChannelAdapter,
  FormattedQuestion,
  PollReference,
  RemoteAnswer,
  SendResult,
} from "./channels.js";
import { formatForSlack, parseSlackReply } from "./format.js";

const SLACK_API = "https://slack.com/api";

export class SlackAdapter implements ChannelAdapter {
  readonly name = "slack";
  private botUserId: string | null = null;
  private readonly token: string;
  private readonly channelId: string;

  constructor(token: string, channelId: string) {
    this.token = token;
    this.channelId = channelId;
  }

  async validate(): Promise<void> {
    const res = await this.slackApi("auth.test", {});
    if (!res.ok) {
      throw new Error(`Slack auth failed: ${res.error ?? "invalid token"}`);
    }
    this.botUserId = res.user_id as string;
  }

  async sendQuestions(questions: FormattedQuestion[]): Promise<SendResult> {
    const blocks = formatForSlack(questions);

    const res = await this.slackApi("chat.postMessage", {
      channel: this.channelId,
      text: "GSD needs your input",
      blocks,
    });

    if (!res.ok) {
      throw new Error(`Slack postMessage failed: ${res.error ?? "unknown"}`);
    }

    const ts = res.ts as string;
    const channel = res.channel as string;

    return {
      ref: {
        channelType: "slack",
        messageId: ts,
        threadTs: ts,
        channelId: channel,
      },
      threadUrl: `https://slack.com/archives/${channel}/p${ts.replace(".", "")}`,
    };
  }

  async pollResponse(ref: PollReference): Promise<RemoteAnswer | null> {
    // Ensure we know our bot user ID
    if (!this.botUserId) {
      const authRes = await this.slackApi("auth.test", {});
      if (authRes.ok) this.botUserId = authRes.user_id as string;
    }

    const res = await this.slackApi("conversations.replies", {
      channel: ref.channelId,
      ts: ref.threadTs!,
      limit: "20",
    });

    if (!res.ok) {
      // Channel not found or no access — don't throw, just return null
      return null;
    }

    const messages = (res.messages ?? []) as Array<{
      user: string;
      text: string;
      ts: string;
    }>;

    // Filter out the bot's own messages — only user replies count
    const userReplies = messages.filter(
      (m) => m.ts !== ref.threadTs && m.user !== this.botUserId,
    );

    if (userReplies.length === 0) return null;

    // Use the first user reply
    const reply = userReplies[0];
    // We need the questions for parsing — store them on the ref isn't ideal,
    // so the caller will need to pass them. For now, return raw text wrapped.
    return { answers: { _raw: { answers: [reply.text] } } };
  }

  /**
   * Poll with full question context for proper parsing.
   */
  async pollResponseWithQuestions(
    ref: PollReference,
    questions: FormattedQuestion[],
  ): Promise<RemoteAnswer | null> {
    if (!this.botUserId) {
      const authRes = await this.slackApi("auth.test", {});
      if (authRes.ok) this.botUserId = authRes.user_id as string;
    }

    const res = await this.slackApi("conversations.replies", {
      channel: ref.channelId,
      ts: ref.threadTs!,
      limit: "20",
    });

    if (!res.ok) return null;

    const messages = (res.messages ?? []) as Array<{
      user: string;
      text: string;
      ts: string;
    }>;

    const userReplies = messages.filter(
      (m) => m.ts !== ref.threadTs && m.user !== this.botUserId,
    );

    if (userReplies.length === 0) return null;

    return parseSlackReply(userReplies[0].text, questions);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async slackApi(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = `${SLACK_API}/${method}`;

    const isGet = method === "conversations.replies" || method === "auth.test";

    let response: Response;
    if (isGet) {
      // GET params must be strings for URLSearchParams
      const stringParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        stringParams[k] = String(v);
      }
      const qs = new URLSearchParams(stringParams).toString();
      response = await fetch(`${url}?${qs}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}` },
      });
    } else {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(params),
      });
    }

    if (!response.ok) {
      throw new Error(`Slack API HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
