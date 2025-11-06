/**
 * 解码 Base64 字符串
 *
 * @param base64 - Base64 编码的字符串
 * @returns 解码后的字符串
 */
export function decodeBase64(base64: string): string {
  // 移除 data URL 前缀（如果存在）
  const cleanBase64 = base64.replace(/^data:application\/json;base64,/, "");

  // 浏览器环境
  if (typeof window !== "undefined" && window.atob) {
    return window.atob(cleanBase64);
  }

  // Node.js 环境
  if (typeof Buffer !== "undefined") {
    return Buffer.from(cleanBase64, "base64").toString("utf-8");
  }

  throw new Error("No Base64 decoder available");
}

/**
 * 编码为 Base64 字符串
 *
 * @param str - 要编码的字符串
 * @returns Base64 编码的字符串
 */
export function encodeBase64(str: string): string {
  // 浏览器环境
  if (typeof window !== "undefined" && window.btoa) {
    return window.btoa(str);
  }

  // Node.js 环境
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }

  throw new Error("No Base64 encoder available");
}
