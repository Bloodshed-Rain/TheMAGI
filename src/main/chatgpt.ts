import fs from "fs";
import path from "path";
import { CONFIG_PATH } from "../config";
import { ChatGPTClient, type ChatGPTStore } from "../chatgptOAuth";
import { verifyChatGPTIdentity } from "../chatgptIdentity";

let client: ChatGPTClient | null = null;
export function getChatGPTClient(): ChatGPTClient {
  if (client) return client;
  const { safeStorage, shell } = require("electron") as typeof import("electron");
  if (!safeStorage)
    throw new Error(
      "ChatGPT sign-in is available inside the MAGI desktop app. Use another provider for standalone Node CLI analysis.",
    );
  const file = path.join(path.dirname(CONFIG_PATH), "chatgpt-auth.enc");
  const requireEncryption = () => {
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
    )
      throw new Error("Secure OS credential storage is unavailable. ChatGPT sign-in requires protected local storage.");
  };
  client = new ChatGPTClient({
    read: () => {
      requireEncryption();
      if (!fs.existsSync(file)) return null;
      const store = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as ChatGPTStore;
      if (!store.hostId || !Array.isArray(store.profiles))
        throw new Error("The saved ChatGPT connection could not be read.");
      return store;
    },
    write: (store) => {
      requireEncryption();
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(store)), { mode: 0o600 });
        fs.renameSync(temporary, file);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    },
    openBrowser: (url) => shell.openExternal(url),
    verifyIdentity: verifyChatGPTIdentity,
  });
  return client;
}
