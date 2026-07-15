import { Compass } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-6 text-center">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="mb-6 flex h-16 w-16 items-center justify-center border border-border bg-surface/40">
        <Compass className="h-7 w-7 text-label" strokeWidth={1.5} />
      </div>
      <p className="font-mono text-eyebrow uppercase text-label">Error 404</p>
      <h1 className="mt-2 font-serif text-3xl text-foreground">Off the flight plan</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-subtext">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/command-center">Return to Command Center</Link>
      </Button>
    </div>
  );
}
