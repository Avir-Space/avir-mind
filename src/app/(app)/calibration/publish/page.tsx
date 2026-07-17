"use client";

import { ChevronLeft, Loader2, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/avir/page-header";
import { ScoreboardView } from "@/components/calibration/scoreboard-view";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { CAL_WINDOWS, PUBLICATION_CHANNEL, SCOREBOARD_TYPE_LABEL } from "@/lib/design/calibration";
import { useCalibrationActions } from "@/lib/mutations/use-calibration-actions";
import { useCalibrationScoreboards, useScoreboard } from "@/lib/queries/use-calibration";

const dt = (iso: string) => new Date(iso).toLocaleString();

export default function CalibrationPublishPage() {
  const { data: boards, isLoading } = useCalibrationScoreboards();
  const { generateScoreboard, regenerateNarrative, scoreboardHash, publishScoreboard } = useCalibrationActions();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: board } = useScoreboard(selectedId);
  const [win, setWin] = useState(180);
  const [channel, setChannel] = useState("customer_report");
  const [aiBusy, setAiBusy] = useState(false);

  async function generate() {
    const id = await generateScoreboard.mutateAsync({ windowDays: win });
    setSelectedId(id);
    toast({ title: "Scoreboard generated", description: "Deterministic narrative ready. Regenerate with AI for an Opus-authored version." });
  }

  async function regenerate() {
    if (!selectedId) return;
    setAiBusy(true);
    try {
      const r = await regenerateNarrative(selectedId);
      toast({ title: r.ok ? "Narrative regenerated" : "Kept deterministic narrative", description: r.ok ? `Opus · $${r.cost_usd?.toFixed(4)}` : r.note });
    } catch (e) { toast({ title: "AI narrative unavailable", description: String((e as Error).message).slice(0, 90) }); }
    finally { setAiBusy(false); }
  }

  async function publish() {
    if (!selectedId) return;
    try {
      const hash = await scoreboardHash(selectedId);
      const r = await publishScoreboard.mutateAsync({ scoreboardId: selectedId, channel, contentHash: hash });
      toast({ title: "Scoreboard published", description: `Channel: ${PUBLICATION_CHANNEL[channel]} · hash ${r.content_hash.slice(0, 12)}…` });
    } catch (e) { toast({ title: "Publish failed", description: String((e as Error).message).slice(0, 120) }); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/calibration" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Calibration</Link></div>
      <PageHeader eyebrow="Proof" title="Compose Scoreboard" subtitle="Generate, review the honest narrative, and publish a calibration scoreboard." />

      <div className="flex min-h-0 flex-1">
        {/* Left: list + generate */}
        <div className="w-80 shrink-0 overflow-y-auto avir-scroll border-r border-border p-4">
          <div className="mb-3 border border-border bg-card p-3">
            <p className="eyebrow mb-2">Generate new</p>
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-eyebrow uppercase text-label">Window</span>
              <Select value={String(win)} onValueChange={(v) => setWin(Number(v))}>
                <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{CAL_WINDOWS.map((w) => <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button size="sm" className="w-full" onClick={generate} disabled={generateScoreboard.isPending}>
              {generateScoreboard.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Generate scoreboard
            </Button>
          </div>

          <p className="eyebrow mb-2">Scoreboards</p>
          {isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (boards ?? []).map((b) => (
            <button key={b.id} type="button" onClick={() => setSelectedId(b.id)}
              className={`mb-1.5 block w-full border px-3 py-2 text-left transition-colors ${selectedId === b.id ? "border-primary bg-surface/60" : "border-border hover:border-border-strong"}`}>
              <p className="text-[12px] text-foreground">{b.scoreboard_name}</p>
              <p className="mt-0.5 font-mono text-[10px] text-hint">
                {SCOREBOARD_TYPE_LABEL[b.scoreboard_type] ?? b.scoreboard_type} · {b.window_days}d
                {b.is_published ? <span className="text-severity-low"> · published</span> : <span className="text-hint"> · draft</span>}
              </p>
            </button>
          ))}
          {(boards?.length ?? 0) === 0 && !isLoading && <p className="text-[12px] text-hint">No scoreboards yet — generate one.</p>}
        </div>

        {/* Right: preview + publish */}
        <div className="flex-1 overflow-y-auto avir-scroll p-6">
          {!selectedId ? <p className="text-sm text-hint">Select or generate a scoreboard to preview its narrative.</p> : !board ? <Skeleton className="h-64 w-full" /> : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="font-serif text-xl text-foreground">{board.scoreboard_name}</h2>
                {board.is_published ? <span className="font-mono text-[11px] uppercase text-severity-low">Published {board.published_at_utc ? dt(board.published_at_utc) : ""}</span> : <span className="font-mono text-[11px] uppercase text-hint">Draft</span>}
                <div className="ml-auto flex items-center gap-2">
                  {!board.is_published && <Button size="sm" variant="outline" onClick={regenerate} disabled={aiBusy}>{aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Regenerate with AI</Button>}
                </div>
              </div>

              <ScoreboardView board={board} />

              {!board.is_published && (
                <div className="mt-6 border border-primary/30 bg-primary/5 p-4">
                  <p className="eyebrow mb-2">Publish</p>
                  <p className="mb-3 text-[12px] text-subtext">Publishing computes a content hash of the narrative + summary and logs an immutable publication record. Once published, the scoreboard is frozen.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={channel} onValueChange={setChannel}>
                      <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(PUBLICATION_CHANNEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" onClick={publish} disabled={publishScoreboard.isPending}>
                      {publishScoreboard.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Publish
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
