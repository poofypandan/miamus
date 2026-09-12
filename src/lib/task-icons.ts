export function getTaskIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("pipis") || t.includes("pup")) return "💧";
  if (t.includes("makan") || t.includes("snack")) return "🍖";
  if (t.includes("mandi")) return "🚿";
  if (t.includes("sikat")) return "🪥";
  if (t.includes("obat") || t.includes("medic")) return "💊";
  return "📝";
}
