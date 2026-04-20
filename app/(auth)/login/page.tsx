"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage(`Magic link sent to ${email}. Check your inbox.`);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-baseline gap-2">
          <span className="font-serif italic text-4xl tracking-tight">Meridian</span>
          <span
            className="inline-block w-1.5 h-1.5 rounded-full -translate-y-3"
            style={{ background: "var(--color-accent)" }}
          />
        </div>

        <h1 className="font-serif text-4xl leading-tight tracking-tight mb-3">
          Sign <em className="text-[color:var(--color-ink-soft)]">in</em>
        </h1>
        <p className="text-[color:var(--color-ink-soft)] mb-8 text-[15px]">
          Stock movements, documents, and tax exposure in one place.
        </p>

        <button
          onClick={signInWithGoogle}
          className="btn w-full justify-center py-3 mb-4"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.1c-2 1.5-4.5 2.3-7.2 2.3-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.1C41.1 35.5 44 30.2 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[color:var(--color-line)]" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
            or by email
          </span>
          <div className="flex-1 h-px bg-[color:var(--color-line)]" />
        </div>

        <form onSubmit={signInWithEmail} className="space-y-3">
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-3 text-sm bg-white focus:outline-none focus:border-[color:var(--color-ink)]"
            style={{ borderColor: "var(--color-line)" }}
            required
            disabled={status === "sending" || status === "sent"}
          />
          <button
            type="submit"
            disabled={status === "sending" || status === "sent"}
            className="btn btn-primary w-full justify-center py-3 disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : status === "sent" ? "Sent ✓" : "Send magic link"}
          </button>
        </form>

        {message && (
          <p
            className={`mt-4 text-[13px] ${status === "error" ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-ok)]"}`}
          >
            {message}
          </p>
        )}

        <p className="mt-10 text-[12px] text-[color:var(--color-ink-faint)] font-mono uppercase tracking-widest">
          Meridian · v1.0
        </p>
      </div>
    </div>
  );
}
