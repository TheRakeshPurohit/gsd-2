/**
 * Remote Questions — Discord adapter
 *
 * Uses Discord Bot HTTP API (no gateway/websocket):
 * - Send: POST /channels/{id}/messages with embed
 * - Poll: GET reactions + GET messages after the sent message
 */

import type {
  ChannelAdapter,
  FormattedQuestion,
  PollReference,
  RemoteAnswer,
  SendResult,
} from "./channels.js";
import { formatForDiscord, parseDiscordResponse } from "./format.js";

const DISCORD_API = "https://discord.com/api/v10";

export class DiscordAdapter implements ChannelAdapter {
  readonly name = "discord";
  private botUserId: string | null = null;
  private readonly token: string;
  private readonly channelId: string;

  constructor(token: string, channelId: string) {
    this.token = token;
    this.channelId = channelId;
  }

  async validate(): Promise<void> {
    const res = await this.discordApi("GET", "/users/@me");
    if (!res.id) {
      throw new Error("Discord auth failed: invalid token");
    }
    this.botUserId = res.id as string;
  }

  async sendQuestions(questions: FormattedQuestion[]): Promise<SendResult> {
    const { embeds, reactionEmojis } = formatForDiscord(questions);

    const res = await this.discordApi("POST", `/channels/${this.channelId}/messages`, {
      content: "**GSD needs your input** — reply to this message or react with your choice",
      embeds,
    });

    if (!res.id) {
      throw new Error(`Discord send failed: ${JSON.stringify(res)}`);
    }

    const messageId = res.id as string;

    // Add reaction emojis as templates (best-effort, don't block on failure)
    for (const emoji of reactionEmojis) {
      try {
        await this.discordApi(
          "PUT",
          `/channels/${this.channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
        );
      } catch {
        // Non-critical — continue
      }
    }

    return {
      ref: {
        channelType: "discord",
        messageId,
        channelId: this.channelId,
      },
    };
  }

  async pollResponse(ref: PollReference): Promise<RemoteAnswer | null> {
    return this.pollResponseWithQuestions(ref, []);
  }

  /**
   * Poll with full question context for proper parsing.
   */
  async pollResponseWithQuestions(
    ref: PollReference,
    questions: FormattedQuestion[],
  ): Promise<RemoteAnswer | null> {
    if (!this.botUserId) {
      const me = await this.discordApi("GET", "/users/@me");
      if (me.id) this.botUserId = me.id as string;
    }

    // Strategy 1: Check reactions on the original message
    const reactionAnswer = await this.checkReactions(ref, questions);
    if (reactionAnswer) return reactionAnswer;

    // Strategy 2: Check for text replies after the message
    const replyAnswer = await this.checkReplies(ref, questions);
    if (replyAnswer) return replyAnswer;

    return null;
  }

  private async checkReactions(
    ref: PollReference,
    questions: FormattedQuestion[],
  ): Promise<RemoteAnswer | null> {
    const numberEmojis = ["1\ufe0f\u20e3", "2\ufe0f\u20e3", "3\ufe0f\u20e3", "4\ufe0f\u20e3", "5\ufe0f\u20e3"];
    const reactions: Array<{ emoji: string; count: number }> = [];

    for (const emoji of numberEmojis) {
      try {
        const users = await this.discordApi(
          "GET",
          `/channels/${ref.channelId}/messages/${ref.messageId}/reactions/${encodeURIComponent(emoji)}`,
        );

        if (Array.isArray(users)) {
          // Filter out bot's own reactions
          const humanUsers = users.filter(
            (u: { id: string }) => u.id !== this.botUserId,
          );
          if (humanUsers.length > 0) {
            reactions.push({ emoji, count: humanUsers.length });
          }
        }
      } catch {
        // Reaction not present or no access
      }
    }

    if (reactions.length === 0) return null;

    return parseDiscordResponse(reactions, null, questions);
  }

  private async checkReplies(
    ref: PollReference,
    questions: FormattedQuestion[],
  ): Promise<RemoteAnswer | null> {
    const messages = await this.discordApi(
      "GET",
      `/channels/${ref.channelId}/messages?after=${ref.messageId}&limit=10`,
    );

    if (!Array.isArray(messages)) return null;

    // Only accept replies that explicitly reference our message via Discord's reply feature
    const replies = messages.filter(
      (m: { author: { id: string }; message_reference?: { message_id: string }; content: string }) =>
        m.author.id !== this.botUserId &&
        m.message_reference?.message_id === ref.messageId,
    );

    if (replies.length === 0) return null;

    const firstReply = replies[0] as { content: string };
    return parseDiscordResponse([], firstReply.content, questions);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async discordApi(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const url = `${DISCORD_API}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bot ${this.token}`,
    };

    const init: RequestInit = { method, headers };

    if (body) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    // For reaction PUT, 204 No Content is success
    if (response.status === 204) return {};

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Discord API HTTP ${response.status}: ${text}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
