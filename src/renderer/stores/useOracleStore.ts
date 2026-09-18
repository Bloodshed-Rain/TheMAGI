import { create } from "zustand";
type Message = Awaited<ReturnType<typeof window.clippi.oracleListMessages>>[number];
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
interface OracleState {
  messages: Message[]; draft: string; question: string; response: string; status: string;
  requestId: string | null; stopping: boolean; loadingHistory: boolean; error: string | null;
  setDraft: (text: string) => void; load: () => Promise<void>; ask: (text: string) => Promise<void>;
  stop: () => Promise<void>; clear: () => Promise<void>;
}
export const useOracleStore = create<OracleState>((set, get) => ({
  messages: [], draft: "", question: "", response: "", status: "", requestId: null,
  stopping: false, loadingHistory: false, error: null,
  setDraft: draft => set({ draft }),
  load: async () => {
    if (get().requestId || get().loadingHistory) return;
    set({ loadingHistory: true, error: null });
    try { set({ messages: await window.clippi.oracleListMessages() }); }
    catch (error) { set({ error: errorText(error) }); }
    finally { set({ loadingHistory: false }); }
  },
  ask: async raw => {
    const question = raw.trim();
    if (!question || get().requestId || get().loadingHistory) return;
    const requestId = crypto.randomUUID();
    set({ requestId, question, response: "", draft: "", error: null, stopping: false, status: "Preparing your question" });
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = window.clippi.onOracleStream(event => {
        if (event.requestId === requestId && !get().stopping) set(state => ({ response: state.response + event.chunk, status: event.status }));
      });
      const result = await window.clippi.oracleAsk(question, requestId);
      // Completion may win a race with Stop; show the exchange saved by the backend.
      set(state => ({ messages: [...state.messages, result.user, result.assistant], response: "", question: "", status: "" }));
    } catch (error) {
      const stopped = get().stopping;
      set(state => ({ error: stopped ? null : errorText(error), status: stopped ? "Response stopped. Your question is ready to edit or resend." : "", draft: state.draft || question, response: "" }));
    } finally { unsubscribe?.(); set({ requestId: null, stopping: false }); }
  },
  stop: async () => {
    const id = get().requestId;
    if (!id || get().stopping) return;
    set({ stopping: true, status: "Stopping response…" });
    try { await window.clippi.oracleCancel(id); }
    catch (error) { set({ stopping: false, error: errorText(error) }); }
  },
  clear: async () => {
    if (get().requestId || get().loadingHistory) return;
    try { await window.clippi.oracleClear(); set({ messages: [], question: "", response: "", error: null, status: "History cleared." }); }
    catch (error) { set({ error: errorText(error) }); }
  },
}));
