export interface ManifestSlot {
  file: string;
  yaw?: number;
  rotation?: readonly [number, number, number];
}

export interface StyleSet {
  label: string;
  note: string;
  slots: Record<string, ManifestSlot>;
}

export interface AssetManifest {
  version: number;
  slots: Record<string, ManifestSlot>;
  /** Empty keeps the meshes already on the board. A name here is a preview, not a locked look. */
  activeStyle?: string;
  styles?: Record<string, StyleSet>;
}

/** Empty on purpose. Current meshes stay in `models.ts` until a file fills a slot. */
export const EMPTY_MANIFEST: AssetManifest = { version: 1, slots: {}, activeStyle: "", styles: {} };

function parseStyle(value: unknown): StyleSet | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { label?: unknown; note?: unknown; slots?: unknown };
  const slots: Record<string, ManifestSlot> = {};
  if (record.slots && typeof record.slots === "object") {
    for (const [key, slotValue] of Object.entries(record.slots as Record<string, unknown>)) {
      const slot = parseSlot(slotValue);
      if (!key.trim() || !slot) continue;
      slots[key] = slot;
    }
  }
  return {
    label: typeof record.label === "string" ? record.label : "",
    note: typeof record.note === "string" ? record.note : "",
    slots,
  };
}

function parseSlot(value: unknown): ManifestSlot | null {
  if (typeof value === "string") {
    const file = value.trim();
    return file ? { file } : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { file?: unknown; yaw?: unknown; rotation?: unknown };
  if (typeof record.file !== "string" || !record.file.trim()) return null;
  const slot: ManifestSlot = { file: record.file.trim() };
  if (typeof record.yaw === "number" && Number.isFinite(record.yaw)) slot.yaw = record.yaw;
  if (
    Array.isArray(record.rotation) &&
    record.rotation.length === 3 &&
    record.rotation.every((part) => typeof part === "number" && Number.isFinite(part))
  ) {
    slot.rotation = [record.rotation[0], record.rotation[1], record.rotation[2]];
  }
  return slot;
}

export function parseAssetManifest(data: unknown): AssetManifest {
  if (!data || typeof data !== "object") return EMPTY_MANIFEST;
  const record = data as { version?: unknown; slots?: unknown };
  const slots: Record<string, ManifestSlot> = {};
  if (record.slots && typeof record.slots === "object") {
    for (const [key, value] of Object.entries(record.slots as Record<string, unknown>)) {
      const slot = parseSlot(value);
      if (!key.trim() || !slot) continue;
      slots[key] = slot;
    }
  }
  const styles: Record<string, StyleSet> = {};
  const rawStyles = (record as { styles?: unknown }).styles;
  if (rawStyles && typeof rawStyles === "object") {
    for (const [key, value] of Object.entries(rawStyles as Record<string, unknown>)) {
      const style = parseStyle(value);
      if (!key.trim() || !style) continue;
      styles[key] = style;
    }
  }
  const version = typeof record.version === "number" && Number.isFinite(record.version) ? record.version : 1;
  const active = (record as { activeStyle?: unknown }).activeStyle;
  return {
    version,
    slots,
    activeStyle: typeof active === "string" ? active : "",
    styles,
  };
}

export function activeStyleSlots(manifest: AssetManifest): Record<string, ManifestSlot> {
  const id = manifest.activeStyle ?? "";
  if (!id) return {};
  return manifest.styles?.[id]?.slots ?? {};
}

export function resolveManifestSlot(manifest: AssetManifest, keys: readonly string[]): ManifestSlot | undefined {
  for (const key of keys) {
    const slot = manifest.slots[key];
    if (slot?.file) return slot;
  }
  return undefined;
}

export async function loadAssetManifest(url = "/assets/manifest.json"): Promise<AssetManifest> {
  try {
    const response = await fetch(url);
    if (!response.ok) return EMPTY_MANIFEST;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return EMPTY_MANIFEST;
    return parseAssetManifest(await response.json());
  } catch {
    return EMPTY_MANIFEST;
  }
}
