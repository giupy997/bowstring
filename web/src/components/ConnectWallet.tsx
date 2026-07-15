"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWallet() {
  // Defer first paint to the client to avoid SSR/hydration mismatches and
  // skip RainbowKit's own opacity-0 placeholder dance, which sometimes leaves
  // the button invisible in dev.
  const [mountedClient, setMountedClient] = useState(false);
  useEffect(() => setMountedClient(true), []);
  if (!mountedClient) {
    return <div style={{ width: 120, height: 36 }} aria-hidden />;
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = account && chain;

        return (
          <div>
            {(() => {
              if (!connected) {
                return (
                  <button onClick={openConnectModal} className="connect-btn">
                    <span className="dot dot-idle" />
                    connect
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button onClick={openChainModal} className="connect-btn connect-btn-danger">
                    <span className="dot dot-danger" />
                    wrong network
                  </button>
                );
              }

              return (
                <div className="connect-group">
                  <button onClick={openChainModal} className="chain-pill">
                    {chain.hasIcon && chain.iconUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={chain.iconUrl}
                        alt={chain.name ?? "chain"}
                        className="chain-icon"
                      />
                    )}
                    {chain.name}
                  </button>
                  <div className="connect-divider" />
                  <button onClick={openAccountModal} className="account-pill">
                    <span className="dot dot-ok" />
                    {shortAddr(account.address)}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
