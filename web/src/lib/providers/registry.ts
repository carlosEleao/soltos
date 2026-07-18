import { bethaPrefeitura } from "@/lib/providers/betha-prefeitura";
import type { ProviderAdapter } from "@/lib/providers/types";

const providers: ProviderAdapter[] = [bethaPrefeitura];

export function listProviders(): ProviderAdapter[] {
  return providers;
}

export function getProvider(key: string): ProviderAdapter | undefined {
  return providers.find((p) => p.key === key);
}

/** Placeholders for future adapters — kept explicit for product roadmap. */
export const upcomingProviders = [
  {
    key: "energia-generico",
    kind: "ENERGIA" as const,
    name: "Rede de energia",
    description: "Em breve: acompanhar protocolos e abertura de tickets da concessionária.",
  },
  {
    key: "internet-generico",
    kind: "INTERNET" as const,
    name: "Provedor de internet",
    description: "Em breve: status de chamados e abertura de tickets do ISP.",
  },
];
