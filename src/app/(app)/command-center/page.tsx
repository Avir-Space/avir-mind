import { CommandCenterCanvas } from "@/components/command-center/canvas";

/**
 * Command Center — the operational canvas. Live fleet map, station rollup strip,
 * and operational timeline. (The old severity-ranked inbox now lives at /signals.)
 */
export default function CommandCenterPage() {
  return <CommandCenterCanvas />;
}
