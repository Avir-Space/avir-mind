"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div>
        <div className="mb-6 flex h-12 w-12 items-center justify-center border border-border bg-surface/40">
          <CheckCircle2 className="h-6 w-6 text-severity-low" strokeWidth={1.5} />
        </div>
        <h2 className="font-serif text-3xl text-foreground">Reset link sent</h2>
        <p className="mt-3 text-sm leading-relaxed text-subtext">
          If an account exists for <span className="text-foreground">{email}</span>, a
          password-reset link is on its way.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow mb-2">Account recovery</p>
      <h2 className="font-serif text-3xl text-foreground">Reset password</h2>
      <p className="mt-2 text-sm text-subtext">
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@operator.com"
          />
        </div>

        {error && (
          <p className="flex items-center gap-2 border border-severity-critical/40 bg-severity-critical/5 px-3 py-2 text-xs text-severity-critical">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="h-11 w-full text-[15px] hover:bg-[#0D14BE] active:bg-[#0A11A8]"
          disabled={loading}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-sm text-subtext">
        Remembered it?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
