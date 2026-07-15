"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // The signup DB trigger already provisions the org + demo fleet. We call
    // seed_avir_demo again as a safe, idempotent belt-and-suspenders when a
    // session exists (email confirmation disabled).
    if (data.session && data.user) {
      await supabase.rpc("seed_avir_demo", { p_user_id: data.user.id });
      router.replace("/command-center");
      router.refresh();
      return;
    }

    // Email confirmation is enabled — tell the user to check their inbox.
    setCheckEmail(true);
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <div>
        <div className="mb-6 flex h-12 w-12 items-center justify-center border border-border bg-surface/40">
          <CheckCircle2 className="h-6 w-6 text-severity-low" strokeWidth={1.5} />
        </div>
        <h2 className="font-serif text-3xl text-foreground">Check your email</h2>
        <p className="mt-3 text-sm leading-relaxed text-subtext">
          We sent a confirmation link to <span className="text-foreground">{email}</span>.
          Confirm your address to finish setting up your account and demo fleet.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow mb-2">Get started</p>
      <h2 className="font-serif text-3xl text-foreground">Create your account</h2>
      <p className="mt-2 text-sm text-subtext">
        We&apos;ll provision a demo airline with 3 fleets and 24 aircraft so you can
        explore immediately.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
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
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>

        {error && (
          <p className="flex items-center gap-2 border border-severity-critical/40 bg-severity-critical/5 px-3 py-2 text-xs text-severity-critical">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </Button>
      </form>

      <p className="mt-6 text-sm text-subtext">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
