"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for observability; wire to a logger in a later phase.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center border border-severity-critical/40 bg-severity-critical/5">
        <AlertTriangle className="h-7 w-7 text-severity-critical" strokeWidth={1.5} />
      </div>
      <h2 className="font-serif text-2xl text-foreground">Something went wrong</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-subtext">
        An unexpected error occurred while loading this view. Your data is safe — try again.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-eyebrow uppercase text-hint">Ref {error.digest}</p>
      )}
      <Button onClick={reset} variant="outline" className="mt-6">
        Try again
      </Button>
    </div>
  );
}
