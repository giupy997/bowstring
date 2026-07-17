import { NetworkBanner } from "@/components/NetworkBanner";
import { Header } from "@/components/Header";
import { HeroCity } from "@/components/HeroCity";
import { Stats } from "@/components/Stats";
import { RecentMints } from "@/components/RecentMints";
import { Genesis } from "@/components/Genesis";
import { Miner } from "@/components/Miner";
import { Trade } from "@/components/Trade";
import { MinerAgent } from "@/components/MinerAgent";
import { GOLD_ADDRESS } from "@/lib/contract";

export default function Page() {
  return (
    <>
      <NetworkBanner />
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <section>
          <h1 className="font-mono text-3xl mb-2">
            mined ERC-8004 agent with a self-hook
          </h1>
          <p className="text-sm max-w-2xl"
             style={{ color: "var(--fg-muted)" }}>
            One contract, three roles: the{" "}
            <span style={{ color: "var(--accent)" }}>ERC-8004 agent</span>{" "}
            token, the Uniswap V4 hook that collects 1% of every swap,
            and the PoW miner that releases 18.9M GOLD over time.
            Ships with a soulbound{" "}
            <span style={{ color: "var(--accent)" }}>Miner Agent NFT</span>{" "}
            collection. No owner. No mint key. No proxy.
          </p>
        </section>

        <HeroCity />

        <Stats />

        <RecentMints />

        <div className="grid md:grid-cols-2 gap-6">
          <Genesis />
          <Miner />
        </div>

        <Trade />

        <MinerAgent />

        <footer className="pt-8 border-t font-mono text-xs space-y-1"
                style={{ borderColor: "var(--border)", color: "var(--fg-muted)" }}>
          <div>total supply: 21,000,000 GOLD</div>
          <div>genesis: 5% (1.05M) · LP: 5% (1.05M) · mining: 90% (18.9M)</div>
          <div>retarget: every 2,016 mints, ±4× clamped</div>
          <div>halving: every 100,000 mints</div>
          <div>swap fee: 1% to controller</div>
          <div className="pt-3">
            chain: Robinhood Chain (chainId 4663)
          </div>
          <div className="break-all">
            contract:{" "}
            <a
              href={`https://robinhoodchain.blockscout.com/address/${GOLD_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--accent)" }}
            >
              {GOLD_ADDRESS}
            </a>
          </div>
          <div>
            agent manifest:{" "}
            <a
              href="/agent.json"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--accent)" }}
            >
              /agent.json
            </a>
          </div>
          <div>
            x:{" "}
            <a
              href="https://x.com/gold-tbd"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--accent)" }}
            >
              @gold-tbd
            </a>
          </div>
        </footer>
      </main>
    </>
  );
}
