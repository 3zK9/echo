import { SWRConfiguration } from "swr";

export const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export const swrConfig: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: false,
  dedupingInterval: 2000,
  shouldRetryOnError: false,
};

