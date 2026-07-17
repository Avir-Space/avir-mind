"use client";

import { ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { ScoreboardView } from "@/components/calibration/scoreboard-view";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PUBLICATION_CHANNEL } from "@/lib/design/calibration";
import { useCalibrationPublications, useScoreboard } from "@/lib/queries/use-calibration";

const dt = (iso: string) => new Date(iso).toLocaleString();

export default function CalibrationPublicationsPage() {
  const { data: pubs, isLoading } = useCalibrationPublications();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: board } = useScoreboard(openId);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/calibration" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Calibration</Link></div>
      <PageHeader eyebrow="Proof" title="Publications" subtitle="Formally published scoreboards, with content hashes and channels." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <div className="border border-border">
            <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label">
              <span className="flex-1">Scoreboard</span><span className="w-28">Channel</span><span className="w-40">Published</span><span className="w-48">Content hash</span>
            </div>
            {(pubs ?? []).map((p) => (
              <button key={p.id} type="button" onClick={() => setOpenId(p.scoreboard_id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-surface/40">
                <span className="flex-1 text-[13px] text-primary">{p.scoreboard_name}</span>
                <span className="w-28 font-mono text-[11px] text-body">{PUBLICATION_CHANNEL[p.publication_channel] ?? p.publication_channel}</span>
                <span className="w-40 font-mono text-[11px] text-hint">{dt(p.published_at_utc)}</span>
                <MonoText muted className="w-48 truncate text-[10px]">{p.publication_content_hash.slice(0, 24)}…</MonoText>
                {p.publication_url && <a href={p.publication_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink className="h-3.5 w-3.5 text-label hover:text-foreground" /></a>}
              </button>
            ))}
            {(pubs?.length ?? 0) === 0 && <p className="px-3 py-6 text-center text-sm text-hint">No published scoreboards yet.</p>}
          </div>
        )}
      </div>

      <Dialog open={Boolean(openId)} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto avir-scroll sm:max-w-3xl">
          <DialogHeader><DialogTitle>{board?.scoreboard_name ?? "Scoreboard"}</DialogTitle></DialogHeader>
          {board ? <ScoreboardView board={board} /> : <Skeleton className="h-64 w-full" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
