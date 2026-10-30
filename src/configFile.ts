import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

/** Replace configuration only after the complete new file is written and
 * flushed. Failed writes leave the previous settings and credentials intact. */
export function writeConfigFile(destination: string, value: unknown): void {
  const temporary = path.join(path.dirname(destination), `.config-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600, flush: true });
    fs.renameSync(temporary, destination);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {
      /* Rename already removed it, or writing never created it. */
    }
  }
}
