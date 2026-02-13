export function isDemoMode() {
  return (process.env.DEMO_MODE ?? "false").toLowerCase() === "true";
}
