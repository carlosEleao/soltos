import { bethaPrefeitura } from "@/lib/providers/betha-prefeitura";
import { energiaProvider } from "@/lib/providers/energia";
import { internetProvider } from "@/lib/providers/internet";
import type { ProviderAdapter } from "@/lib/providers/types";

const providers: ProviderAdapter[] = [
  bethaPrefeitura,
  energiaProvider,
  internetProvider,
];

export function listProviders(): ProviderAdapter[] {
  return providers;
}

export function getProvider(key: string): ProviderAdapter | undefined {
  return providers.find((p) => p.key === key);
}
