"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { rotateSeedPair } from "@/server/games/actions";

export function SeedRotation({ className }: { readonly className?: string }) {
  const [state, action, pending] = useActionState(rotateSeedPair, {});

  return (
    <section className={className} aria-labelledby="rotate">
      <h2 id="rotate" className="text-section">
        Rotate your seeds
      </h2>
      <p className="mt-3 max-w-[62ch] text-body text-night-muted">
        This reveals the server seed you have been playing against and starts a new one.
        Do it whenever you like — there is no cost and no waiting.
      </p>

      <form
        action={action}
        className="mt-6 max-w-[34rem] rounded-[10px] border border-night-rule-strong bg-night-raised p-5"
      >
        <label htmlFor="clientSeed" className="label-mono block text-night-muted">
          New client seed (optional)
        </label>
        <p className="mt-1.5 text-small text-night-muted">
          Leave blank for a random one. Anything you type goes into every calculation
          alongside ours.
        </p>
        <input
          id="clientSeed"
          name="clientSeed"
          maxLength={64}
          spellCheck={false}
          placeholder="Leave blank for random"
          className={cn(
            "figure-num tap mt-2 w-full rounded-[8px] border border-night-rule-strong bg-night-sunk",
            "px-3 py-2.5 text-small outline-none transition-colors focus:border-night-blue",
            "placeholder:text-night-muted",
          )}
        />

        {state.notice ? (
          <p
            role="status"
            className="mt-4 rounded-[8px] border border-night-green/40 bg-night-green/10 px-3 py-2.5 text-small"
          >
            {state.notice}
          </p>
        ) : null}

        <Button type="submit" tone="night" size="lg" full disabled={pending} className="mt-5">
          {pending ? "Rotating…" : "Reveal my seed and start a new one"}
        </Button>
      </form>
    </section>
  );
}
