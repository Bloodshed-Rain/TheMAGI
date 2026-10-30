import { shell } from "electron";
import { saveConfig, loadConfig } from "../../config";
import { getChatGPTClient } from "../chatgpt";
import type { SafeHandleFn } from "../ipc";

export function registerChatGPTHandlers(safeHandle: SafeHandleFn): void {
  safeHandle("chatgpt:status", () => getChatGPTClient().status());
  safeHandle(
    "chatgpt:connect",
    async (_event, options: { profileId?: string; newProfile?: boolean; requestConsent?: boolean } = {}) => {
      const client = getChatGPTClient();
      const status = await client.signIn(options);
      if (status.sharing) {
        const models = await client.listModels();
        const selected = loadConfig().modelByProvider.chatgpt;
        const modelId = models.find((model) => model.id === selected)?.id || models[0]?.id;
        if (modelId) saveConfig({ activeProvider: "chatgpt", modelByProvider: { chatgpt: modelId } });
      }
      return client.status();
    },
  );
  safeHandle("chatgpt:cancel", () => {
    getChatGPTClient().cancelSignIn();
    return true;
  });
  safeHandle("chatgpt:select", (_event, id: string) => getChatGPTClient().selectProfile(id));
  safeHandle("chatgpt:disconnect", () => getChatGPTClient().signOut());
  safeHandle("chatgpt:models", () => getChatGPTClient().listModels());
  safeHandle("chatgpt:usage", () => shell.openExternal("https://chatgpt.com/settings/usage"));
}
