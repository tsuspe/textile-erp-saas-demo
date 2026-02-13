// app/(app)/[empresa]/legacy/ExcelPreview.tsx
"use client";

import JSZip from "jszip";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  empresa: string;
  filePath: string;
  initialSheet?: string;
  onSheetsLoaded?: (names: string[]) => void; // 👈 AÑADIR
};

type ImgBox = {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function isExcel(name: string) {
  const n = name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function emuToPx(emu: number) {
  return (emu * 96) / 914400;
}

function buildSpanMaps(merges: XLSX.Range[]) {
  const topLeft = new Map<string, { rowSpan: number; colSpan: number }>();
  const covered = new Set<string>();

  for (const m of merges) {
    const rowSpan = m.e.r - m.s.r + 1;
    const colSpan = m.e.c - m.s.c + 1;

    topLeft.set(`${m.s.r}:${m.s.c}`, { rowSpan, colSpan });

    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        covered.add(`${r}:${c}`);
      }
    }
  }

  return { topLeft, covered };
}

function argbToHex(argb: string) {
  if (!argb) return null;
  const a = argb.trim();
  if (a.length === 8) return `#${a.slice(2)}`;
  if (a.length === 6) return `#${a}`;
  return null;
}

function applyTint(hex: string, tint?: number) {
  if (tint === undefined || tint === null) return hex;
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  const t = Number(tint);
  const f = (c: number) => {
    if (t < 0) return Math.round(c * (1 + t));
    return Math.round(c + (255 - c) * t);
  };

  const rr = f(r).toString(16).padStart(2, "0");
  const gg = f(g).toString(16).padStart(2, "0");
  const bb = f(b).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

const INDEXED: Record<number, string> = {
  8: "#000000",
  9: "#ffffff",
  10: "#ff0000",
  11: "#00ff00",
  12: "#0000ff",
  13: "#ffff00",
  14: "#ff00ff",
  15: "#00ffff",
};

function getThemeColorHex(wb: XLSX.WorkBook, themeIndex: number) {
  const anyWb: any = wb as any;
  const theme = anyWb?.Themes?.themeElements?.clrScheme;
  if (!theme) return null;

  const keys = [
    "lt1",
    "dk1",
    "lt2",
    "dk2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink",
  ];

  const k = keys[themeIndex];
  if (!k) return null;

  const entry = theme[k];
  const rgb = entry?.srgbClr?.val || entry?.sysClr?.lastClr;
  return rgb ? `#${rgb}` : null;
}

function resolveFontColor(wb: XLSX.WorkBook, fontColor: any) {
  if (!fontColor) return null;

  const rgbHex = argbToHex(fontColor.rgb);
  if (rgbHex) return applyTint(rgbHex, fontColor.tint);

  if (typeof fontColor.indexed === "number") {
    const base = INDEXED[fontColor.indexed] || null;
    return base ? applyTint(base, fontColor.tint) : null;
  }

  if (typeof fontColor.theme === "number") {
    const base = getThemeColorHex(wb, fontColor.theme);
    return base ? applyTint(base, fontColor.tint) : null;
  }

  return null;
}

function getCellStyle(wb: XLSX.WorkBook, cell: any): React.CSSProperties {
  const s = cell?.s;
  if (!s) return {};

  const font = s.font || {};
  const fill = s.fill || {};
  const align = s.alignment || {};

  const style: React.CSSProperties = {};

  if (font.bold) style.fontWeight = 700;
  if (font.italic) style.fontStyle = "italic";
  if (font.sz) style.fontSize = `${Math.max(10, Math.min(18, font.sz))}px`;

  const color = resolveFontColor(wb, font.color);
  if (color) style.color = color;

  // 🔴 Si el formato numérico marca rojo, aplícalo
  if (!style.color) {
    const fmt = (cell?.z as string) || (cell?.s?.numFmt as string) || "";
    if (/\[red\]/i.test(fmt)) {
      style.color = "#ff4d4d";
      style.fontWeight = style.fontWeight ?? 700;
    }
  }

  // 🔴 Heurística extra: negativos en rojo si no hay color
  if (!style.color && typeof cell?.v === "number" && cell.v < 0) {
    style.color = "#ff4d4d";
    style.fontWeight = style.fontWeight ?? 700;
  }

  const fillRgb = fill.fgColor?.rgb;
  if (fillRgb && fillRgb.length === 8) style.backgroundColor = `#${fillRgb.slice(2)}`;

  const h = align.horizontal;
  const v = align.vertical;
  if (h === "center" || h === "right" || h === "left") style.textAlign = h;
  if (v === "center" || v === "top" || v === "bottom") style.verticalAlign = v;

  if (align.wrapText) style.whiteSpace = "normal";

  return style;
}

function computeColWidths(ws: XLSX.WorkSheet, maxCols: number) {
  const cols: any[] = (ws as any)["!cols"] || [];
  const out: number[] = [];
  for (let c = 0; c < maxCols; c++) {
    const wpx = cols[c]?.wpx;
    const width = typeof wpx === "number" && wpx > 0 ? wpx : 90;
    out.push(clamp(width, 50, 180));
  }
  return out;
}

function computeRowHeights(ws: XLSX.WorkSheet, maxRows: number) {
  const rows: any[] = (ws as any)["!rows"] || [];
  const out: number[] = [];
  for (let r = 0; r < maxRows; r++) {
    const hpx = rows[r]?.hpx;
    const height = typeof hpx === "number" && hpx > 0 ? hpx : 22;
    out.push(clamp(height, 18, 60));
  }
  return out;
}

function prefixSums(nums: number[]) {
  const ps = [0];
  for (let i = 0; i < nums.length; i++) ps.push(ps[i] + nums[i]);
  return ps;
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function elsByLocalName(root: ParentNode, local: string): Element[] {
  const out: Element[] = [];
  const all = (root as Document).getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as Element;
    if ((el.localName || el.tagName).toLowerCase() === local.toLowerCase()) out.push(el);
  }
  return out;
}

function firstChildByLocalName(root: ParentNode, local: string): Element | null {
  const all = (root as Element).getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as Element;
    if ((el.localName || el.tagName).toLowerCase() === local.toLowerCase()) return el;
  }
  return null;
}

function textOfFirst(root: ParentNode, local: string): string {
  const el = firstChildByLocalName(root, local);
  return (el?.textContent || "").trim();
}

// 🔥 imágenes robustas
function firstDirectChildByLocalName(root: Element, local: string): Element | null {
  const target = local.toLowerCase();
  for (let i = 0; i < root.childNodes.length; i++) {
    const n = root.childNodes[i];
    if (n.nodeType !== 1) continue;
    const el = n as Element;
    const ln = (el.localName || el.tagName).toLowerCase();
    if (ln === target) return el;
  }
  return null;
}

async function extractImagesFromXlsx(
  arrayBuffer: ArrayBuffer,
  sheetXmlTarget: string,
  colPs: number[],
  rowPs: number[],
) {
  const zip = await JSZip.loadAsync(arrayBuffer);

  const sheetFileName = sheetXmlTarget.split("/").pop()!;
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFileName}.rels`;

  const relsFile = zip.file(sheetRelsPath);
  if (!relsFile) return [] as ImgBox[];

  const relsDoc = parseXml(await relsFile.async("string"));
  const rels = elsByLocalName(relsDoc, "Relationship");

  const drawingRel = rels.find((r) => (r.getAttribute("Type") || "").includes("/drawing"));
  if (!drawingRel) return [] as ImgBox[];

  let drawingTarget = drawingRel.getAttribute("Target") || "";
  drawingTarget = drawingTarget.replace(/^..\//, "");
  const drawingPath = `xl/${drawingTarget}`;

  const drawingFile = zip.file(drawingPath);
  if (!drawingFile) return [] as ImgBox[];

  const drawingName = drawingPath.split("/").pop()!;
  const drawingRelsPath = `xl/drawings/_rels/${drawingName}.rels`;
  const drawingRelsFile = zip.file(drawingRelsPath);
  if (!drawingRelsFile) return [] as ImgBox[];

  const drawingRelsDoc = parseXml(await drawingRelsFile.async("string"));
  const drRels = elsByLocalName(drawingRelsDoc, "Relationship");

  const ridToTarget = new Map<string, string>();
  for (const r of drRels) {
    const id = r.getAttribute("Id") || "";
    let target = r.getAttribute("Target") || "";
    target = target.replace(/^..\//, "");
    ridToTarget.set(id, `xl/${target}`);
  }

  const drawingDoc = parseXml(await drawingFile.async("string"));
  const anchors = [
    ...elsByLocalName(drawingDoc, "oneCellAnchor"),
    ...elsByLocalName(drawingDoc, "twoCellAnchor"),
  ];

  const out: ImgBox[] = [];
  let idx = 0;

  for (const a of anchors) {
    const blip = firstChildByLocalName(a, "blip");
    const embed = blip?.getAttribute("r:embed") || blip?.getAttribute("embed");
    if (!embed) continue;

    const mediaPath = ridToTarget.get(embed);
    if (!mediaPath) continue;

    const mediaFile = zip.file(mediaPath);
    if (!mediaFile) continue;

    const from = firstDirectChildByLocalName(a as Element, "from");
    if (!from) continue;

    const col = Number(textOfFirst(from, "col") || "0");
    const row = Number(textOfFirst(from, "row") || "0");
    const colOff = Number(textOfFirst(from, "colOff") || "0");
    const rowOff = Number(textOfFirst(from, "rowOff") || "0");

    const x = (colPs[col] ?? 0) + emuToPx(colOff);
    const y = (rowPs[row] ?? 0) + emuToPx(rowOff);

    const extEl = firstDirectChildByLocalName(a as Element, "ext");
    const to = firstDirectChildByLocalName(a as Element, "to");

    let w = 140;
    let h = 140;

    if (extEl) {
      const cx = Number(extEl.getAttribute("cx") || "0");
      const cy = Number(extEl.getAttribute("cy") || "0");
      if (cx) w = emuToPx(cx);
      if (cy) h = emuToPx(cy);
    } else if (to) {
      const toCol = Number(textOfFirst(to, "col") || "0");
      const toRow = Number(textOfFirst(to, "row") || "0");
      const toColOff = Number(textOfFirst(to, "colOff") || "0");
      const toRowOff = Number(textOfFirst(to, "rowOff") || "0");

      const x2 = (colPs[toCol] ?? 0) + emuToPx(toColOff);
      const y2 = (rowPs[toRow] ?? 0) + emuToPx(toRowOff);

      w = Math.max(40, x2 - x);
      h = Math.max(40, y2 - y);
    }

    const base64 = await mediaFile.async("base64");
    const extLower = mediaPath.split(".").pop()?.toLowerCase();
    const mime =
      extLower === "png"
        ? "image/png"
        : extLower === "jpg" || extLower === "jpeg"
          ? "image/jpeg"
          : "application/octet-stream";

    out.push({
      id: `${sheetXmlTarget}:${idx++}`,
      dataUrl: `data:${mime};base64,${base64}`,
      x,
      y,
      w,
      h,
    });
  }

  return out;
}

function computeUsedBounds(ws: XLSX.WorkSheet, rMax: number, cMax: number) {
  let lastRow = -1;
  let lastCol = -1;

  for (let r = 0; r < rMax; r++) {
    for (let c = 0; c < cMax; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws as any)[addr];
      if (!cell) continue;

      const hasValue = cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== "";
      const hasFormula = !!cell.f;
      const hasStyle = !!cell.s;

      if (hasValue || hasFormula || hasStyle) {
        lastRow = Math.max(lastRow, r);
        lastCol = Math.max(lastCol, c);
      }
    }
  }

  return {
    rows: Math.max(1, lastRow + 1),
    cols: Math.max(1, lastCol + 1),
  };
}

function cellDisplay(cell: any) {
  if (!cell) return "";
  if (cell.w !== undefined && cell.w !== null && String(cell.w) !== "") return String(cell.w);
  if (cell.v !== undefined && cell.v !== null && String(cell.v) !== "") return String(cell.v);
  if (cell.f) return `=${cell.f}`;
  return "";
}

function storageKey(empresa: string, filePath: string) {
  return `legacyExcelPreview:v1:${empresa}:${filePath}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function ExcelPreview({
  empresa,
  filePath,
  initialSheet,
  onSheetsLoaded,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>("");

  const [maxR, setMaxR] = useState(0);
  const [maxC, setMaxC] = useState(0);

  const [colWidths, setColWidths] = useState<number[]>([]);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const [spans, setSpans] = useState<{
    topLeft: Map<string, { rowSpan: number; colSpan: number }>;
    covered: Set<string>;
  } | null>(null);

  const [images, setImages] = useState<ImgBox[]>([]);
  const [wbCache, setWbCache] = useState<XLSX.WorkBook | null>(null);
  const [sheetXmlMap, setSheetXmlMap] = useState<Map<string, string> | null>(null);
  const [fileBuf, setFileBuf] = useState<ArrayBuffer | null>(null);

  const [showImages, setShowImages] = useState(true);
  const [imgScale, setImgScale] = useState(0.55);

  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const offsetStartRef = useRef<{ x: number; y: number } | null>(null);


  // (si no los vas a tocar, podrían ser const; los dejo como estaba)
  const [imgMaxW] = useState(260);
  const [imgMaxH] = useState(320);

  const [imgOffsetBySheet, setImgOffsetBySheet] = useState<Record<string, { x: number; y: number }>>(
    () => {
      if (typeof window === "undefined") return {};
      const key = storageKey(empresa, filePath);
      return safeParse<Record<string, { x: number; y: number }>>(localStorage.getItem(key), {});
    },
  );

  const currentImgOffset = imgOffsetBySheet[activeSheet] ?? { x: 0, y: 0 };

  function setCurrentOffset(next: { x: number; y: number }) {
    setImgOffsetBySheet((prev) => ({
      ...prev,
      [activeSheet]: next,
    }));
  }

  // autoscale
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [gridW, setGridW] = useState(0);

  const url = useMemo(() => {
    const p = encodeURIComponent(filePath);
    return `/${empresa}/api/legacy/file?p=${p}&raw=1`;
  }, [empresa, filePath]);

  useEffect(() => {
    let cancelled = false;

    async function renderSheet(
      wb: XLSX.WorkBook,
      map: Map<string, string>,
      buf: ArrayBuffer,
      sheetName: string,
    ) {
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error("Hoja no encontrada");

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");

      const hardMaxRows = 250;
      const hardMaxCols = 60;

      const endRow = clamp(range.e.r, range.s.r, range.s.r + hardMaxRows - 1);
      const endCol = clamp(range.e.c, range.s.c, range.s.c + hardMaxCols - 1);

      const sliced = { s: range.s, e: { r: endRow, c: endCol } };
      const ref = XLSX.utils.encode_range(sliced);

      const ws2: XLSX.WorkSheet = { ...ws, "!ref": ref };

      const bounds = computeUsedBounds(ws2, endRow + 1, endCol + 1);
      const rCount = clamp(bounds.rows, 1, hardMaxRows);
      const cCount = clamp(bounds.cols, 1, hardMaxCols);

      const merges = (ws2["!merges"] || []) as XLSX.Range[];
      const spanMaps = buildSpanMaps(merges);

      const cw = computeColWidths(ws2, cCount);
      const rh = computeRowHeights(ws2, rCount);

      setMaxR(rCount);
      setMaxC(cCount);
      setSpans(spanMaps);
      setColWidths(cw);
      setRowHeights(rh);

      const totalW = cw.reduce((a, b) => a + b, 0);
      setGridW(totalW);

      const colPs = prefixSums(cw);
      const rowPs = prefixSums(rh);

      const sheetXml = map.get(sheetName);
      if (sheetXml && filePath.toLowerCase().endsWith(".xlsx")) {
        const imgs = await extractImagesFromXlsx(buf, sheetXml, colPs, rowPs);
        setImages(imgs);
      } else {
        setImages([]);
      }
    }

    async function load() {
      try {
        setLoading(true);
        setErr(null);
        setImages([]);

        // refresca offsets guardados para ESTE archivo
        if (typeof window !== "undefined") {
          const key = storageKey(empresa, filePath);
          setImgOffsetBySheet(safeParse(localStorage.getItem(key), {}));
        }

        if (!isExcel(filePath)) {
          setErr("Este archivo no es Excel.");
          return;
        }

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`No se pudo cargar Excel (${res.status}). ${txt}`);
        }

        const buf = await res.arrayBuffer();
        if (cancelled) return;
        setFileBuf(buf);

        const wb = XLSX.read(buf, {
          type: "array",
          cellStyles: true,
          cellDates: true,
        });

        const names = wb.SheetNames || [];
        if (!names.length) throw new Error("El Excel no tiene hojas.");

        setSheetNames(names);

        // 👇 AÑADIDO
        if (onSheetsLoaded) {
          onSheetsLoaded(names);
        }


        const zip = await JSZip.loadAsync(buf);
        const wbXml = await zip.file("xl/workbook.xml")?.async("string");
        const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
        if (!wbXml || !relsXml) throw new Error("No se pudo leer workbook.xml / rels");

        const wbDoc = parseXml(wbXml);
        const relsDoc = parseXml(relsXml);

        const ridToTarget = new Map<string, string>();
        for (const rel of elsByLocalName(relsDoc, "Relationship")) {
          const id = rel.getAttribute("Id") || "";
          let target = rel.getAttribute("Target") || "";
          target = target.replace(/^\/+/, "");
          ridToTarget.set(id, target);
        }

        const map = new Map<string, string>();
        for (const s of elsByLocalName(wbDoc, "sheet")) {
          const n = s.getAttribute("name") || "";
          const rid = s.getAttribute("r:id") || "";
          const target = ridToTarget.get(rid);
          if (n && target) map.set(n, target);
        }

        setWbCache(wb);
        setSheetXmlMap(map);
        setSheetNames(names);

        // 👇 prioridad: initialSheet (del server) > querystring > primera
        const fromQuery = sp.get("sheet") || "";
        const wanted =
          (initialSheet && names.includes(initialSheet) && initialSheet) ||
          (fromQuery && names.includes(fromQuery) && fromQuery) ||
          names[0];

        setActiveSheet(wanted);
        await renderSheet(wb, map, buf, wanted);

        // sincroniza URL (sheet=...) pero sin spamear si ya coincide
        const current = sp.get("sheet") || "";
        if (current !== wanted) {
          const next = new URLSearchParams(sp.toString());
          next.set("sheet", wanted);
          router.replace(`/${empresa}/legacy?${next.toString()}`);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Error leyendo Excel");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [empresa, filePath, url, initialSheet, router, sp]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = storageKey(empresa, filePath);
    localStorage.setItem(key, JSON.stringify(imgOffsetBySheet));
  }, [empresa, filePath, imgOffsetBySheet]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (!gridW) return;
      const s = gridW > w ? clamp(w / gridW, 0.6, 1) : 1;
      setScale(s);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [gridW]);

  function onImageMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    offsetStartRef.current = { ...currentImgOffset };
  }


  function onImageMouseMove(e: React.MouseEvent) {
    if (!dragging || !dragStartRef.current || !offsetStartRef.current) return;

    const dx = (e.clientX - dragStartRef.current.x) / (scale || 1);
    const dy = (e.clientY - dragStartRef.current.y) / (scale || 1);

    setCurrentOffset({
      x: offsetStartRef.current.x + dx,
      y: offsetStartRef.current.y + dy,
    });

  }

  function onImageMouseUp() {
    setDragging(false);
    dragStartRef.current = null;
    offsetStartRef.current = null;
  }


  async function handleSheetChange(next: string) {
    try {
      setLoading(true);
      setErr(null);
      setImages([]);

      if (!wbCache || !sheetXmlMap || !fileBuf) throw new Error("Workbook no cargado");

      setActiveSheet(next);

      const qs = new URLSearchParams(sp.toString());
      qs.set("sheet", next);
      router.replace(`/${empresa}/legacy?${qs.toString()}`);

      const ws = wbCache.Sheets[next];
      if (!ws) throw new Error("Hoja no encontrada");

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");

      const hardMaxRows = 250;
      const hardMaxCols = 60;

      const endRow = clamp(range.e.r, range.s.r, range.s.r + hardMaxRows - 1);
      const endCol = clamp(range.e.c, range.s.c, range.s.c + hardMaxCols - 1);

      const sliced = { s: range.s, e: { r: endRow, c: endCol } };
      const ref = XLSX.utils.encode_range(sliced);

      const ws2: XLSX.WorkSheet = { ...ws, "!ref": ref };

      const bounds = computeUsedBounds(ws2, endRow + 1, endCol + 1);
      const rCount = clamp(bounds.rows, 1, hardMaxRows);
      const cCount = clamp(bounds.cols, 1, hardMaxCols);

      const merges = (ws2["!merges"] || []) as XLSX.Range[];
      const spanMaps = buildSpanMaps(merges);

      const cw = computeColWidths(ws2, cCount);
      const rh = computeRowHeights(ws2, rCount);

      setMaxR(rCount);
      setMaxC(cCount);
      setSpans(spanMaps);
      setColWidths(cw);
      setRowHeights(rh);

      const totalW = cw.reduce((a, b) => a + b, 0);
      setGridW(totalW);

      const colPs = prefixSums(cw);
      const rowPs = prefixSums(rh);

      const sheetXml = sheetXmlMap.get(next);
      if (sheetXml && filePath.toLowerCase().endsWith(".xlsx")) {
        const imgs = await extractImagesFromXlsx(fileBuf, sheetXml, colPs, rowPs);
        setImages(imgs);
      } else {
        setImages([]);
      }
    } catch (e: any) {
      setErr(e?.message || "Error cambiando de hoja");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Cargando Excel…</p>;

  if (err) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-xs font-semibold text-red-300">No se pudo previsualizar</p>
        <p className="mt-1 text-xs text-slate-300">{err}</p>
      </div>
    );
  }

  const ws = wbCache?.Sheets?.[activeSheet];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          Preview recortado ({maxR} filas / {maxC} cols). Scale: {Math.round(scale * 100)}%
        </p>

        <p className="text-[11px] text-slate-500">
          💡 Arrastra las imágenes con el ratón para recolocarlas. La posición se guarda por hoja.
        </p>


        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={showImages}
              onChange={(e) => setShowImages(e.target.checked)}
            />
            Fotos
          </label>

          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            Escala foto
            <input
              type="range"
              min={0.35}
              max={0.9}
              step={0.05}
              value={imgScale}
              onChange={(e) => setImgScale(Number(e.target.value))}
            />
            <span className="text-slate-500">{Math.round(imgScale * 100)}%</span>
          </label>

          <button
            type="button"
            onClick={() => setCurrentOffset({ x: 0, y: 0 })}
            className="rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900"
            title="Resetea offsets de esta hoja"
          >
            Reset foto
          </button>
        </div>

        {sheetNames.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Hoja:</span>
            <select
              value={activeSheet}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1 text-xs text-slate-200"
            >
              {sheetNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div
        ref={wrapRef}
        className="rounded-lg border border-slate-800 bg-slate-950 overflow-auto max-h-[70vh]"
      >
        <div
          className="relative inline-block p-2"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            cursor: dragging ? "grabbing" : "auto",
          }}
          onMouseMove={onImageMouseMove}
          onMouseUp={onImageMouseUp}
          onMouseLeave={onImageMouseUp}
        >

          {showImages &&
            images.map((img) => {
              const w = Math.min(img.w * imgScale, imgMaxW);
              const h = Math.min(img.h * imgScale, imgMaxH);

              return (
                <img
                  key={img.id}
                  src={img.dataUrl}
                  alt=""
                  draggable={false}
                  onMouseDown={onImageMouseDown}
                  style={{
                    position: "absolute",
                    left: img.x + currentImgOffset.x,
                    top: img.y + currentImgOffset.y,
                    width: w,
                    height: h,
                    objectFit: "contain",
                    borderRadius: 6,
                    zIndex: 5,
                    opacity: 0.92,
                    cursor: dragging ? "grabbing" : "grab",
                  }}
                  className="border border-slate-700/30 bg-slate-950/30 shadow-sm select-none"
                />

              );
            })}

          <table id="excel-grid" className="border-collapse text-xs text-slate-200">
            <colgroup>
              {Array.from({ length: maxC }).map((_, c) => (
                <col key={c} style={{ width: colWidths[c] || 90 }} />
              ))}
            </colgroup>

            <tbody>
              {Array.from({ length: maxR }).map((_, r) => (
                <tr key={r} style={{ height: rowHeights[r] || 22 }}>
                  {Array.from({ length: maxC }).map((_, c) => {
                    const key = `${r}:${c}`;
                    if (spans?.covered.has(key)) return null;

                    const span = spans?.topLeft.get(key);
                    const addr = XLSX.utils.encode_cell({ r, c });
                    const cell = ws ? (ws as any)[addr] : undefined;

                    const value = cellDisplay(cell);

                    return (
                      <td
                        key={c}
                        rowSpan={span?.rowSpan}
                        colSpan={span?.colSpan}
                        style={{
                          ...getCellStyle(wbCache!, cell),
                          padding: "6px 8px",
                          border: "1px solid rgba(148, 163, 184, 0.22)",
                          whiteSpace: "nowrap",
                          backgroundClip: "padding-box",
                        }}
                        className="align-top"
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <style jsx global>{`
            #excel-grid tr:nth-child(even) td {
              background-image: linear-gradient(
                to bottom,
                rgba(15, 23, 42, 0.10),
                rgba(15, 23, 42, 0.10)
              );
            }
          `}</style>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Fórmulas: si Excel trae resultado cacheado verás el valor. Si no, se muestra la fórmula (=...).
      </p>
    </div>
  );
}
