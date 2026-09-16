// 서버에서만 암호·입력·교사 권한을 검증하며 비밀값은 응답에 넣지 않는다.
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export const TEACHER_EMAIL = "leetae712@gmail.com";
export const BOARDS = new Set(["questions", "feedback", "support"]);
export const MAX_IMAGE = 5 * 1024 * 1024;
export class BoardError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}
export const fail = (code, message) => {
  throw new BoardError(code, message);
};
export const isTeacher = (auth) =>
  !!auth?.uid &&
  auth.token?.email === TEACHER_EMAIL &&
  auth.token?.email_verified === true;
export function key(value, label = "id") {
  if (
    typeof value !== "string" ||
    ["__proto__", "prototype", "constructor"].includes(value) ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value)
  )
    fail("invalid-argument", `Invalid ${label}`);
  return value;
}
export function text(value, label, max, { empty = false } = {}) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    fail("invalid-argument", `Invalid ${label}`);
  return value;
}
export function password(value) {
  text(value, "password", 128);
  if (Buffer.byteLength(value, "utf8") > 128)
    fail("invalid-argument", "Password too long");
  return value;
}
export function fields(input, allowed) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    fail("invalid-argument", "Unsupported field");
}
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function stableJSON(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableJSON(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function hashPassword(value) {
  password(value);
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(value, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return { algorithm: "scrypt", salt, hash: hash.toString("hex"), version: 1 };
}
export async function verifyPassword(value, credential) {
  password(value);
  if (
    credential?.algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(credential.salt || "") ||
    !/^[a-f0-9]{64}$/.test(credential.hash || "")
  )
    return false;
  const actual = await scrypt(value, credential.salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(actual, Buffer.from(credential.hash, "hex"));
}
export function imageBytes(base64, mime) {
  if (
    typeof base64 !== "string" ||
    base64.length > Math.ceil(MAX_IMAGE / 3) * 4 ||
    /[^A-Za-z0-9+/=]/.test(base64)
  )
    fail("invalid-argument", "Invalid image encoding or size");
  const bytes = Buffer.from(base64, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_IMAGE ||
    bytes.toString("base64") !== base64
  )
    fail("invalid-argument", "Invalid image size");
  const png =
    bytes.length >= 20 &&
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
    bytes.subarray(-8, -4).toString() === "IEND";
  const jpg =
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9;
  const webp =
    bytes.length >= 16 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.readUInt32LE(4) + 8 === bytes.length;
  if (
    !(mime === "image/png" && png) &&
    !(mime === "image/jpeg" && jpg) &&
    !(mime === "image/webp" && webp)
  )
    fail("invalid-argument", "Unsupported image signature");
  return bytes;
}
export function pushKey(ms) {
  const alphabet =
    "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s = alphabet[ms % 64] + s;
    ms = Math.floor(ms / 64);
  }
  return s + [...randomBytes(12)].map((b) => alphabet[b % 64]).join("");
}
export function timeString(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}/${p.month}/${p.day} ${p.dayPeriod} ${p.hour}:${p.minute}`;
}
export function legacyTime(value) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (AM|PM) (\d{1,2}):(\d{2})$/.exec(
    value || "",
  );
  if (!m) return 0;
  return Date.UTC(
    +m[1],
    +m[2] - 1,
    +m[3],
    (+m[5] % 12) + (m[4] === "PM" ? 12 : 0) - 9,
    +m[6],
  );
}
