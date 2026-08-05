"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { hashServerSeed, roundBytes } from "@/lib/fair";
import {
  COIN_FLIP_MULTIPLIER,
  crashPoint,
  diceMultiplier,
  formatMultiplier,
  minesBoard,
  playCoinFlip,
  playDice,
  plinkoMultiplier,
  plinkoPath,
} from "@/lib/games";

/**
 * The verifier.
 *
 * Runs in the browser, importing the exact modules the server imports. There is
 * no API call here and no server involvement — if this page and the server ever
 * disagreed about an outcome, the disagreement would be the proof.
 */

const field = cn(
  "figure-num tap w-full rounded-[8px] border border-night-rule-strong bg-night-sunk px-3 py-2.5",
  "text-small text-night-text outline-none transition-colors",
  "placeholder:text-night-muted focus:border-night-blue",
);

type Game = "coin-flip" | "dice" | "mines" | "crash" | "plinko";

export function FairnessVerifier({ className }: { readonly className?: string }) {
  const [serverSeed, setServerSeed] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [nonce, setNonce] = useState("1");
  const [game, setGame] = useState<Game>("coin-flip");
  const [chance, setChance] = useState("50");
  const [mines, setMines] = useState("3");
  const [output, setOutput] = useState<{ hash: string; lines: string[] } | undefined>();

  function verify() {
    const n = Number(nonce);
    if (!serverSeed || !clientSeed || !Number.isInteger(n) || n < 1) {
      setOutput(undefined);
      return;
    }

    const lines: string[] = [];
    const bytes = roundBytes(serverSeed, clientSeed, n);
    lines.push(`HMAC-SHA256 → ${Array.from(bytes.slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("")}…`);

    switch (game) {
      case "coin-flip": {
        const heads = playCoinFlip({ pick: "heads" }, serverSeed, clientSeed, n);
        lines.push(`Landed: ${heads.landed}`);
        lines.push(`Pays ${formatMultiplier(COIN_FLIP_MULTIPLIER)} if you called ${heads.landed}`);
        break;
      }
      case "dice": {
        const c = Math.min(95, Math.max(1, Number(chance) || 50));
        const result = playDice({ chance: c, direction: "under" }, serverSeed, clientSeed, n);
        lines.push(`Roll: ${result.roll.toFixed(2)}`);
        lines.push(`Wins if rolling under ${result.target.toFixed(2)} at ${c}% chance`);
        lines.push(`Pays ${formatMultiplier(diceMultiplier(c))}`);
        break;
      }
      case "mines": {
        const m = Math.min(24, Math.max(1, Number(mines) || 3));
        const board = minesBoard({ mines: m }, serverSeed, clientSeed, n);
        lines.push(`Mines on tiles: ${board.mineTiles.map((t) => t + 1).join(", ")}`);
        break;
      }
      case "crash": {
        const { crashPoint: point } = crashPoint(serverSeed, clientSeed, n);
        lines.push(`Broke at ${formatMultiplier(point)}`);
        break;
      }
      case "plinko": {
        const { path, bucket } = plinkoPath(serverSeed, clientSeed, n);
        lines.push(`Path: ${path.join("")}`);
        lines.push(`Bucket ${bucket + 1} of 13, paying ${formatMultiplier(plinkoMultiplier(bucket))}`);
        break;
      }
    }

    setOutput({ hash: hashServerSeed(serverSeed), lines });
  }

  return (
    <div className={cn("rounded-[10px] border border-night-rule-strong bg-night-raised p-5", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="serverSeed" className="label-mono block text-night-muted">
            Server seed (revealed)
          </label>
          <input
            id="serverSeed"
            value={serverSeed}
            onChange={(e) => setServerSeed(e.target.value.trim())}
            placeholder="64 hex characters"
            spellCheck={false}
            className={`${field} mt-2`}
          />
        </div>

        <div>
          <label htmlFor="clientSeed" className="label-mono block text-night-muted">
            Client seed
          </label>
          <input
            id="clientSeed"
            value={clientSeed}
            onChange={(e) => setClientSeed(e.target.value.trim())}
            spellCheck={false}
            className={`${field} mt-2`}
          />
        </div>

        <div>
          <label htmlFor="nonce" className="label-mono block text-night-muted">
            Nonce
          </label>
          <input
            id="nonce"
            value={nonce}
            onChange={(e) => setNonce(e.target.value.trim())}
            inputMode="numeric"
            className={`${field} mt-2`}
          />
        </div>

        <div>
          <label htmlFor="game" className="label-mono block text-night-muted">
            Game
          </label>
          <select
            id="game"
            value={game}
            onChange={(e) => setGame(e.target.value as Game)}
            className={`${field} mt-2`}
          >
            <option value="coin-flip">Coin Flip</option>
            <option value="dice">Dice</option>
            <option value="mines">Mines</option>
            <option value="crash">Crash</option>
            <option value="plinko">Plinko</option>
          </select>
        </div>

        {game === "dice" ? (
          <div>
            <label htmlFor="chance" className="label-mono block text-night-muted">
              Win chance used
            </label>
            <input
              id="chance"
              value={chance}
              onChange={(e) => setChance(e.target.value.trim())}
              inputMode="numeric"
              className={`${field} mt-2`}
            />
          </div>
        ) : null}

        {game === "mines" ? (
          <div>
            <label htmlFor="mineCount" className="label-mono block text-night-muted">
              Mines used
            </label>
            <input
              id="mineCount"
              value={mines}
              onChange={(e) => setMines(e.target.value.trim())}
              inputMode="numeric"
              className={`${field} mt-2`}
            />
          </div>
        ) : null}
      </div>

      <Button type="button" tone="night" onClick={verify} className="mt-5">
        Recompute
      </Button>

      {output ? (
        <div className="mt-5 border-t border-night-rule pt-4" aria-live="polite">
          <p className="label-mono text-night-muted">Hash of this server seed</p>
          <p className="figure-num mt-1 break-all text-small">{output.hash}</p>
          <p className="mt-2 text-micro text-night-muted">
            Compare against the hash you were shown before playing. If they match, the seed
            is genuine and the outcomes below are the only ones it could have produced.
          </p>

          <div className="mt-4 space-y-1">
            {output.lines.map((line) => (
              <p key={line} className="figure-num text-small">
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
