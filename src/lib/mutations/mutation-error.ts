import { toast } from "@/components/ui/use-toast";

/**
 * Shared onError for write mutations: surfaces RLS/permission denials as a
 * clear, friendly toast (viewers hitting an editor-gated write), and other
 * failures as a generic error toast. Use as `onError: toastMutationError`.
 */
export function toastMutationError(err: unknown) {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  const denied =
    /row-level security|permission|not allowed|violates|insufficient|denied|not authori[sz]ed|forbidden/i.test(msg);
  toast({
    title: denied ? "Permission denied" : "Action failed",
    description: denied
      ? "You don't have permission to perform this action. Contact your admin if you need write access."
      : msg.slice(0, 140) || "Something went wrong. Please try again.",
    variant: "destructive",
  });
}
