"use client";

import { useEffect, useRef, useState } from "react";
import Callout from "@/components/Callout";
import SectionHeader from "@/components/SectionHeader";
import Icon from "@/components/Icon";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Which channel should I cut, and where should the money go?",
  "Why is Google's ROAS so much higher than Meta's?",
  "What happened to leads on 18 May?",
  "Which city has the worst funnel, and at which step?",
  "What will final registrations be on race day?",
  "Is print worth the money?",
];

/**
 * Minimal markdown: paragraphs, bullet lists, bold and inline code.
 *
 * A dependency for this would be several hundred kilobytes to render four constructs,
 * and anything richer than this is not what the model is asked to produce.
 */
function Rendered({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  const inline = (s: string, k: number) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return (
      <span key={k}>
        {parts.map((p, i) => {
          if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
          if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
          return <span key={i}>{p}</span>;
        })}
      </span>
    );
  };
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        const isList = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""), j)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(b.replace(/\n/g, " "), i)}</p>;
      })}
    </>
  );
}

export default function ChatbotTab() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [degraded, setDegraded] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const j = (await res.json()) as { reply: string; degraded?: boolean; reason?: string };
      if (j.degraded) {
        // A configuration failure is not an answer, so it goes in the notice above the
        // thread rather than being dressed up as a reply from the analyst.
        setDegraded(j.reply);
        setMsgs(next);
      } else {
        setDegraded(null);
        setMsgs([...next, { role: "assistant", content: j.reply }]);
      }
    } catch (e) {
      setMsgs([
        ...next,
        { role: "assistant", content: "The request failed: " + (e instanceof Error ? e.message : String(e)) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {degraded ? (
        <Callout tone="warn" title="This view is not available">
          {degraded}
        </Callout>
      ) : null}

      <Callout tone="info" title="What this can and cannot answer">
        The model is given the season aggregates — channel, city, campaign, ticket and
        funnel totals, the last fortnight day by day, and the model results — and is
        instructed to answer only from those and to say so when the answer is not there. It
        is not querying the raw rows, so it cannot tell you about one specific session.
      </Callout>

      <div className="panel">
        <div className="chat-wrap">
          {msgs.length === 0 ? (
            <>
              <SectionHeader title="Ask the dataset" sub="Or start with one of these" />
              <div className="chat-sugg">
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="chat-thread">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "msg user" : "msg bot"}>
                  {m.role === "user" ? m.content : <Rendered text={m.content} />}
                </div>
              ))}
              {busy ? (
                <div className="msg bot">
                  <span className="dots">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : null}
              <div ref={end} />
            </div>
          )}

          <div className="chat-in">
            <textarea
              value={draft}
              placeholder="Ask about channels, cities, campaigns, tickets or the forecast"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              aria-label="Your question"
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !draft.trim()}
              onClick={() => send(draft)}
            >
              <Icon name="sparkles" size={14} />
              Send
            </button>
          </div>
          {msgs.length > 0 ? (
            <div className="row">
              <button type="button" className="btn" onClick={() => setMsgs([])}>
                Clear conversation
              </button>
              <span className="muted" style={{ fontSize: 11.5 }}>
                Enter to send, Shift+Enter for a new line
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
