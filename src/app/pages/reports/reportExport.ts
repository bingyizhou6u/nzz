import { reportGroupLabel, type ReportGroupKey } from "./reportExperience";
import type { ReportsState } from "./reportTypes";

type ExportValue = string | number | null | undefined;

interface ExportSheet {
  name: string;
  rows: object[];
}

export interface ReportExportContext {
  source: "live" | "snapshot";
  period?: string;
  version?: number;
}

export function downloadReportExport(
  group: ReportGroupKey,
  reports: ReportsState,
  format: "csv" | "xlsx",
  context: ReportExportContext = { source: "live" }
) {
  const sheets = format === "xlsx" && context.source === "snapshot" ? exportSheetsForPackage(reports) : exportSheetsForGroup(group, reports);
  const timestamp = new Date().toISOString().slice(0, 10);
  const baseName = exportBaseName(group, format, timestamp, context);
  const blob =
    format === "csv"
      ? new Blob([csvForSheets(sheets)], { type: "text/csv;charset=utf-8" })
      : xlsxBlobForSheets(sheets);
  downloadBlob(blob, `${baseName}.${format}`);
}

export function exportBaseName(
  group: ReportGroupKey,
  format: "csv" | "xlsx",
  timestamp: string,
  context: ReportExportContext
) {
  if (context.source === "snapshot" && context.period && context.version) {
    if (format === "xlsx") return `月结包-${context.period}-v${context.version}`;
    return `${reportGroupLabel(group)}报表-${context.period}-v${context.version}`;
  }

  return `${reportGroupLabel(group)}报表-${timestamp}`;
}

export function exportSheetsForGroup(group: ReportGroupKey, reports: ReportsState): ExportSheet[] {
  if (group === "funding") {
    return [
      { name: "账户余额表", rows: reports.accountBalances },
      { name: "换汇批次表", rows: reports.lotBalances },
      { name: "FIFO消耗明细", rows: reports.lotMovements }
    ];
  }
  if (group === "project") {
    return [
      { name: "项目收支表", rows: reports.projectProfitLoss },
      { name: "项目收入表", rows: reports.projectIncome },
      { name: "商户收入表", rows: reports.merchantIncome },
      { name: "月度经营总表", rows: reports.monthlyOperatingSummary }
    ];
  }
  if (group === "expense") {
    return [
      { name: "费用明细表", rows: reports.expenseDetails },
      { name: "费用汇总表", rows: reports.expenseSummary }
    ];
  }
  if (group === "pettyCash") {
    return [
      { name: "备用金余额表", rows: reports.pettyCashPending },
      { name: "待匹配成本表", rows: reports.pendingCosts }
    ];
  }
  if (group === "loan") {
    return [
      { name: "借款余额表", rows: reports.loanBalances },
      { name: "借款账龄表", rows: reports.loanAging },
      { name: "借款明细表", rows: reports.loanAllocations },
      { name: "借款核销表", rows: reports.loanWriteoffs }
    ];
  }
  return [{ name: "异常检查", rows: reports.exceptionChecks }];
}

export function exportSheetsForPackage(reports: ReportsState): ExportSheet[] {
  return [
    ...exportSheetsForGroup("funding", reports),
    ...exportSheetsForGroup("project", reports),
    ...exportSheetsForGroup("expense", reports),
    ...exportSheetsForGroup("pettyCash", reports),
    ...exportSheetsForGroup("loan", reports),
    ...exportSheetsForGroup("exception", reports)
  ];
}

function csvForSheets(sheets: ExportSheet[]) {
  return sheets
    .flatMap((sheet) => {
      const headers = headersForRows(sheet.rows);
      const lines = [`# ${sheet.name}`, headers.map(csvCell).join(",")];
      const rowLines = sheet.rows.map((row) => headers.map((header) => csvCell(valueForKey(row, header))).join(","));
      return [...lines, ...rowLines, ""];
    })
    .join("\n");
}

function xlsxBlobForSheets(sheets: ExportSheet[]) {
  const workbookSheets = sheets.length ? sheets : [{ name: "报表", rows: [] }];
  const worksheetFiles = workbookSheets.map((sheet, index) => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    data: worksheetXml(sheet)
  }));
  const workbook = xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets
    .map((sheet, index) => `<sheet name="${escapeXml(sheet.name).slice(0, 31)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("")}</sheets>
</workbook>`);
  const workbookRels = xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${workbookSheets
  .map(
    (_sheet, index) =>
      `  <Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  )
  .join("\n")}
</Relationships>`);
  const rootRels = xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  const contentTypes = xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${workbookSheets
  .map(
    (_sheet, index) =>
      `  <Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  )
  .join("\n")}
</Types>`);

  return new Blob(
    [
      zipStore([
        { name: "[Content_Types].xml", data: contentTypes },
        { name: "_rels/.rels", data: rootRels },
        { name: "xl/workbook.xml", data: workbook },
        { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
        ...worksheetFiles
      ])
    ],
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  );
}

function worksheetXml(sheet: ExportSheet) {
  const headers = headersForRows(sheet.rows);
  const worksheetRows = [
    xmlRow(["报表", sheet.name]),
    xmlRow(headers),
    ...sheet.rows.map((row) => xmlRow(headers.map((header) => valueForKey(row, header))))
  ].join("");

  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${worksheetRows}</sheetData>
</worksheet>`);
}

function headersForRows(rows: object[]): string[] {
  return Array.from(rows.reduce<Set<string>>((headers, row) => {
    Object.keys(row).forEach((key) => headers.add(key));
    return headers;
  }, new Set<string>()));
}

function csvCell(value: ExportValue) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function valueForKey(row: object, key: string): ExportValue {
  const value = (row as Record<string, unknown>)[key];
  if (value == null || typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

function xmlRow(values: ExportValue[]) {
  const cells = values
    .map((value) => `<c t="inlineStr"><is><t>${escapeXml(value == null ? "" : String(value))}</t></is></c>`)
    .join("");
  return `<row>${cells}</row>`;
}

function xml(value: string) {
  return new TextEncoder().encode(value);
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function zipStore(files: Array<{ name: string; data: Uint8Array }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data
    ]);
    localParts.push(local);
    centralParts.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name
      ])
    );
    offset += local.length;
  });

  const centralDirectory = concat(centralParts);
  return concat([
    ...localParts,
    centralDirectory,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}
