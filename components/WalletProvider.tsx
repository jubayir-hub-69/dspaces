"use client";

import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { clusterApiUrl } from "@solana/web3.js";
import type { SolanaSignInInput, SolanaSignInOutput } from "@solana/wallet-standard-features";
import { createSignInMessageText, verifySignIn } from "@solana/wallet-standard-util";
import { buildClientSignInInput, serializeSignInOutput } from "../lib/siws";

import "@solana/wallet-adapter-react-ui/styles.css";

type SiwsAuthValue = {
  authenticated: boolean;
  authenticating: boolean;
};

const SiwsAuthContext = createContext<SiwsAuthValue>({
  authenticated: false,
  authenticating: false,
});

export function useSiwsAuth() {
  return useContext(SiwsAuthContext);
}

async function fetchSignInInput(): Promise<SolanaSignInInput> {
  const domain = window.location.host;
  const uri = window.location.origin;
  try {
    const res = await fetch(`/api/siws?domain=${encodeURIComponent(domain)}&uri=${encodeURIComponent(uri)}`);
    const data = (await res.json()) as { input?: SolanaSignInInput };
    if (data.input?.nonce) return data.input;
  } catch {
    // Fall through to a client-generated payload if the nonce endpoint is unreachable.
  }
  return buildClientSignInInput(crypto.randomUUID().replace(/-/g, "").slice(0, 16), domain, uri);
}

async function verifySiws(input: SolanaSignInInput, output: SolanaSignInOutput) {
  const serialized = serializeSignInOutput(output);
  try {
    const res = await fetch("/api/siws", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, output: serialized }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (res.ok && data.success) return;
    if (res.status >= 500 && verifySignIn(input, output)) return;
    throw new Error(data.error || "Sign-In With Solana verification failed.");
  } catch (error) {
    if (error instanceof TypeError && verifySignIn(input, output)) return;
    throw error;
  }
}

function WalletModalMainnetBadge() {
  useEffect(() => {
    const inject = () => {
      const title = document.querySelector(".wallet-adapter-modal-title");
      if (!title || title.querySelector("[data-dspaces-mainnet]")) return;
      const badge = document.createElement("span");
      badge.setAttribute("data-dspaces-mainnet", "true");
      badge.className = "dspaces-wallet-mainnet";
      badge.innerHTML = `<span class="dspaces-wallet-mainnet-dot" aria-hidden="true"></span>Mainnet`;
      title.appendChild(badge);
    };
    inject();
    const observer = new MutationObserver(inject);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

function SiwsAuthGate({ children }: { children: ReactNode }) {
  const { connected, publicKey, signMessage, disconnect } = useWallet();
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const pendingRef = useRef(false);
  const signedAddressRef = useRef<string | null>(null);

  const address = publicKey?.toBase58() || null;

  useEffect(() => {
    if (!connected || !address) {
      pendingRef.current = false;
      signedAddressRef.current = null;
      setAuthenticated(false);
      setAuthenticating(false);
      return;
    }
    if (signedAddressRef.current === address) {
      setAuthenticated(true);
      return;
    }
    if (!signMessage) {
      setAuthenticating(true);
      return;
    }
    if (pendingRef.current) return;

    pendingRef.current = true;
    setAuthenticating(true);
    setAuthenticated(false);

    (async () => {
      try {
        const input = await fetchSignInInput();
        const signedInput: SolanaSignInInput = { ...input, address };
        const messageText = createSignInMessageText({
          domain: input.domain || window.location.host,
          address,
          statement: input.statement,
          uri: input.uri,
          version: input.version,
          chainId: input.chainId,
          nonce: input.nonce,
          issuedAt: input.issuedAt,
          resources: input.resources,
        });
        const signedMessage = new TextEncoder().encode(messageText);
        const signature = await signMessage(signedMessage);
        const output: SolanaSignInOutput = {
          account: {
            address,
            publicKey: publicKey!.toBytes(),
            chains: ["solana:mainnet"] as const,
            features: [] as const,
          },
          signedMessage,
          signature,
          signatureType: "ed25519",
        };
        await verifySiws(signedInput, output);
        signedAddressRef.current = address;
        setAuthenticated(true);
      } catch {
        signedAddressRef.current = null;
        setAuthenticated(false);
        try {
          await disconnect();
        } catch {
          // Ignore disconnect races after a cancelled signature.
        }
      } finally {
        pendingRef.current = false;
        setAuthenticating(false);
      }
    })();
  }, [address, connected, disconnect, publicKey, signMessage]);

  const value = useMemo(
    () => ({ authenticated, authenticating }),
    [authenticated, authenticating]
  );

  return (
    <SiwsAuthContext.Provider value={value}>
      <WalletModalMainnetBadge />
      {children}
    </SiwsAuthContext.Provider>
  );
}

export const AppWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
      new BackpackWalletAdapter(),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <SiwsAuthGate>{children}</SiwsAuthGate>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
