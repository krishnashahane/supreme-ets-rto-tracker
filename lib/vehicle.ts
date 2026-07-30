const VEHICLE_RE = /\b([A-Z]{2})[\s-]?(\d{1,2})[\s-]?([A-Z]{1,3})[\s-]?(\d{1,4})\b/;

export function extractVehicle(name: string): string | null {
  const m = name.toUpperCase().match(VEHICLE_RE);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : null;
}

export function fileId(key: string): string {
  // stable non-crypto id from the blob key
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return `k${(h >>> 0).toString(16)}${key.length.toString(16)}`;
}
