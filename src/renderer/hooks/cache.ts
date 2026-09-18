import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 1000 * 60 * 5 } },
});

export async function refreshData() {
  await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "config" });
}

let clearing = false;
export async function clearReplayData() {
  if (clearing) return;
  clearing = true;
  try {
    await window.clippi.clearAllGames();
    await queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== "config" });
  } finally {
    clearing = false;
  }
}
