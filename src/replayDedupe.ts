import crypto from "crypto";
import fs from "fs";

/** UBJSON key `U\x03raw` that precedes the Slippi raw event stream. */
const RAW_MARKER = Buffer.from([0x55, 0x03, 0x72, 0x61, 0x77]);

/**
 * Extract the Slippi `raw` payload from a .slp file.
 * Layout after the marker: `[$U#l` + uint32BE length + payload bytes.
 */
export function extractSlippiRaw(buf: Buffer): Buffer | null {
  const idx = buf.indexOf(RAW_MARKER);
  if (idx < 0) return null;
  const hdr = buf.subarray(idx + 5, idx + 10);
  if (hdr.toString("latin1") !== "[$U#l") return null;
  const len = buf.readUInt32BE(idx + 10);
  const start = idx + 14;
  if (len < 0 || start + len > buf.length) return null;
  return buf.subarray(start, start + len);
}

/**
 * SHA-256 of the first `prefixLen` bytes of the raw payload.
 * Truncated/incomplete downloads of the same game share this fingerprint
 * even when full-file hashes differ.
 */
export function rawPrefixFingerprint(buf: Buffer, prefixLen = 65536): string | null {
  const raw = extractSlippiRaw(buf);
  if (!raw || raw.length < 1024) return null;
  const prefix = raw.subarray(0, Math.min(prefixLen, raw.length));
  return crypto.createHash("sha256").update(prefix).digest("hex");
}

/**
 * True when one replay's raw payload is a truncated (or near-truncated) copy
 * of the other. Near-truncated allows a short trailing slack so a shorter
 * file that was re-ended with a Game-End event still matches the longer
 * game's shared early frames (as with tests/fixtures/game2.slp vs game1.slp).
 *
 * Chosen rule (documented in PR):
 *   same raw prefix (≥99% of the shorter payload, allowing ≤64B Game-End slack)
 *   ⇒ treat as the same game; do not insert a second win / WR update.
 */
export function isTruncatedOrDuplicateRaw(a: Buffer, b: Buffer, slack = 64): boolean {
  if (a.equals(b)) return true;
  const ra = extractSlippiRaw(a);
  const rb = extractSlippiRaw(b);
  if (!ra || !rb) return false;
  const [shorter, longer] = ra.length <= rb.length ? [ra, rb] : [rb, ra];
  if (shorter.length < 1024) return false;
  if (longer.length === shorter.length) return shorter.equals(longer);
  const compareLen = Math.max(1024, shorter.length - slack);
  return longer.subarray(0, compareLen).equals(shorter.subarray(0, compareLen));
}

export function readReplayBuffer(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

export function isTruncatedOrDuplicatePath(pathA: string, pathB: string): boolean {
  return isTruncatedOrDuplicateRaw(readReplayBuffer(pathA), readReplayBuffer(pathB));
}
