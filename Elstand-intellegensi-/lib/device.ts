/** "Chrome · Windows · Mobile" style label from a User-Agent string. Deliberately coarse — this is a display label, not a fingerprint. */
export function parseDeviceLabel(ua: string): string {
  if (!ua) return "Unknown device";
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
    ? "macOS"
    : /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Linux/.test(ua)
    ? "Linux"
    : "Unknown OS";
  return `${browser} · ${os}${isMobile ? " · Mobile" : ""}`;
}
