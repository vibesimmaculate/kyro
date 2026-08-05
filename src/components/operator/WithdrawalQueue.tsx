"use client";

import { useActionState } from "react";
import { cn } from "@/lib/cn";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { decideWithdrawal } from "@/server/operator/actions";

export interface QueueRow {
  readonly id: string;
  readonly chain: string;
  readonly network: string;
  readonly asset: string;
  readonly address: string;
  readonly amount: string;
  readonly status: string;
  readonly requestedAt: string;
}

export function WithdrawalQueue({
  rows,
  className,
}: {
  readonly rows: readonly QueueRow[];
  readonly className?: string;
}) {
  const [state, action, pending] = useActionState(decideWithdrawal, {});

  return (
    <div className={className}>
      {state.notice ? (
        <p role="status" className="mb-3 text-small text-green">
          {state.notice}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="mb-3 text-small text-red">
          {state.error}
        </p>
      ) : null}

      <ScrollArea label="Withdrawals awaiting a decision">
        <table className="w-full min-w-[48rem] border-collapse text-small">
          <thead>
            <tr className="border-y border-rule-strong">
              <th scope="col" className="label-mono py-2 pe-4 text-end text-ink-faint">
                Amount
              </th>
              <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                Network
              </th>
              <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                To
              </th>
              <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                Requested
              </th>
              <th scope="col" className="label-mono py-2 pe-4 text-start text-ink-faint">
                Status
              </th>
              <th scope="col" className="label-mono py-2 text-end text-ink-faint">
                Decision
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-rule align-baseline">
                <td className="figure-num py-2.5 pe-4 text-end whitespace-nowrap">
                  {row.amount}
                </td>
                <td className="py-2.5 pe-4 text-ink-muted">{row.network}</td>
                <td className="figure-num max-w-[16rem] truncate py-2.5 pe-4 text-micro">
                  {row.address}
                </td>
                <td className="py-2.5 pe-4 text-ink-muted">{row.requestedAt}</td>
                <td className="py-2.5 pe-4">
                  <span
                    className={cn(
                      "label-mono",
                      row.status === "awaiting-approval" ? "text-amber" : "text-ink-faint",
                    )}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="py-2.5 text-end">
                  {row.status === "awaiting-approval" ? (
                    <div className="flex justify-end gap-1.5">
                      <form action={action}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <button
                          type="submit"
                          disabled={pending}
                          className="tap rounded-[6px] border border-green/50 bg-green-wash px-3 text-small text-green transition-colors hover:bg-green/15 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={action}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <button
                          type="submit"
                          disabled={pending}
                          className="tap rounded-[6px] border border-red/50 bg-red-wash px-3 text-small text-red transition-colors hover:bg-red/15 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
