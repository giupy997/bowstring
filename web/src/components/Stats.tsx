"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { bowstringAbi } from "@/lib/bowstringAbi";
import { BOW_ADDRESS } from "@/lib/contract";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
};

function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="panel p-4">
      <div className="panel-label">{label}</div>
      <div className="stat-value mt-2">{value}</div>
      {hint && (
        <div className="font-mono text-xs mt-1" style={{ color: "var(--fg-dim)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value, max }: { value: bigint; max: bigint }) {
  // Scale by 1e10 before integer division so we keep 8 decimal places of
  // precision in the percentage (otherwise tiny ratios like 300 / 18.9M
  // truncate to 0).
  const pct =
    max === 0n ? 0 : Number((value * 10_000_000_000n) / max) / 1e8;
  return (
    <div>
      <div
        className="h-2 rounded-sm overflow-hidden"
        style={{ background: "var(--bg-panel)" }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: "var(--accent)",
          }}
        />
      </div>
      <div className="flex justify-between mt-1 text-xs font-mono"
           style={{ color: "var(--fg-muted)" }}>
        <span>{formatPct(pct)}</span>
        <span>
          {formatUnits(value, 18).split(".")[0]} /{" "}
          {formatUnits(max, 18).split(".")[0]} BOW
        </span>
      </div>
    </div>
  );
}

function formatPct(pct: number): string {
  if (pct === 0) return "0%";
  // Below 0.0001% even 4 decimals collapse to 0.0000 — show as inequality
  // so the user can tell mining is in progress, just very early.
  if (pct < 0.0001) return "<0.0001%";
  if (pct < 1) return `${pct.toFixed(4)}%`;
  if (pct < 100) return `${pct.toFixed(2)}%`;
  return "100%";
}

function formatDifficulty(d: bigint): string {
  if (d === 0n) return "—";
  // Display as 2^N leading-zero target (more intuitive than the raw uint256).
  // We approximate log2 by counting hex zeros from the top.
  const hex = d.toString(16).padStart(64, "0");
  let leadingZeros = 0;
  for (const ch of hex) {
    if (ch === "0") leadingZeros++;
    else break;
  }
  const bits = leadingZeros * 4;
  return `2^${256 - bits}`;
}

const PLACEHOLDER = "—";

export function Stats() {
  const reads = useReadContracts({
    contracts: [
      { address: BOW_ADDRESS, abi: bowstringAbi, functionName: "miningState" },
      { address: BOW_ADDRESS, abi: bowstringAbi, functionName: "genesisState" },
      { address: BOW_ADDRESS, abi: bowstringAbi, functionName: "MINING_SUPPLY" },
      { address: BOW_ADDRESS, abi: bowstringAbi, functionName: "GENESIS_CAP" },
    ],
    query: { refetchInterval: 12_000 },
  });

  const mining = reads.data?.[0]?.result as
    | readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint]
    | undefined;
  const genesis = reads.data?.[1]?.result as
    | readonly [bigint, bigint, bigint, boolean]
    | undefined;
  const miningSupply = reads.data?.[2]?.result as bigint | undefined;
  const genesisCap = reads.data?.[3]?.result as bigint | undefined;

  if (reads.isLoading || (!reads.data && !reads.isError)) {
    return (
      <div className="panel p-4 text-sm font-mono" style={{ color: "var(--fg-muted)" }}>
        loading on-chain state…
      </div>
    );
  }

  const firstReadFailed = reads.data?.[0]?.status === "failure" || !reads.data?.[0]?.result;
  if (reads.isError || firstReadFailed) {
    return (
      <div className="panel p-4 text-sm font-mono" style={{ color: "var(--fg-muted)" }}>
        Contract not reachable. Either the deployed address is not configured
        yet, or your wallet is on the wrong network.
      </div>
    );
  }

  const [era, reward, difficulty, minted, remaining, epoch, epochBlocksLeft] =
    mining ?? [0n, 0n, 0n, 0n, 0n, 0n, 0n];
  const [gMinted, , gEthRaised, gComplete] = genesis ?? [0n, 0n, 0n, false];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="era"
          value={era.toString()}
          hint={`reward halves every 100k mints`}
        />
        <StatCard
          label="reward"
          value={`${formatUnits(reward, 18)} BOW`}
        />
        <StatCard
          label="difficulty"
          value={formatDifficulty(difficulty)}
          hint={`retargets every 2,016 mints`}
        />
        <StatCard
          label="epoch"
          value={`#${epoch}`}
          hint={`${epochBlocksLeft} blocks left`}
        />
      </div>

      <div className="panel p-4">
        <div className="panel-label mb-3">mining supply</div>
        <ProgressBar value={minted} max={miningSupply ?? 18_900_000n * 10n ** 18n} />
      </div>

      <div className="panel p-4">
        <div className="panel-label mb-3">
          genesis {gComplete ? PLACEHOLDER : "(open)"}
        </div>
        <ProgressBar value={gMinted} max={genesisCap ?? 1_050_000n * 10n ** 18n} />
        <div className="mt-2 font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
          ETH raised: {formatUnits(gEthRaised, 18)} ETH
          {gComplete && " — pool seeded ✓"}
        </div>
      </div>
    </div>
  );
}
