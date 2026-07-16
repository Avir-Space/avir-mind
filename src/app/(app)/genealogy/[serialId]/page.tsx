"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { GenealogyView } from "@/components/genealogy/genealogy-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useSerialGenealogy } from "@/lib/queries/use-genealogy";

/** Serial genealogy detail — used for serials the org owned but no longer owns
 *  (GenealogyView renders the read-only "historical" banner automatically). */
export default function SerialGenealogyPage() {
  const params = useParams<{ serialId: string }>();
  const { data, isLoading } = useSerialGenealogy(params.serialId);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pt-4">
        <Link href="/genealogy" className="inline-flex items-center gap-1 pb-3 font-mono text-eyebrow uppercase text-label transition-colors hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Genealogy Vault
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto avir-scroll">
        {isLoading ? (
          <div className="p-6"><Skeleton className="h-32 w-full" /><Skeleton className="mt-4 h-64 w-full" /></div>
        ) : !data ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <h1 className="font-serif text-2xl text-foreground">Genealogy not found</h1>
            <p className="mt-2 text-sm text-subtext">This serial doesn&apos;t exist or you never owned it.</p>
          </div>
        ) : (
          <GenealogyView view={data} />
        )}
      </div>
    </div>
  );
}
