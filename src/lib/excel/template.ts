import * as ExcelJS from "exceljs";

const COMMON_HEADERS = ["Domanda", "Tempo (sec)", "Punti", "Confidenza (S/N)"];

export const SHEETS = [
  {
    name: "Scelta Multipla",
    headers: [
      ...COMMON_HEADERS,
      "Opzione1",
      "Opzione2",
      "Opzione3",
      "Opzione4",
      "Opzione5",
      "Opzione6",
      "Corretta",
    ],
    example: [
      "Qual è la capitale d'Italia?",
      30,
      1000,
      "N",
      "Roma",
      "Milano",
      "Napoli",
      "Torino",
      "",
      "",
      "1",
    ],
  },
  {
    name: "Vero o Falso",
    headers: [...COMMON_HEADERS, "Risposta (V/F)"],
    example: ["La Terra è piatta", 20, 1000, "N", "F"],
  },
  {
    name: "Risposta Aperta",
    headers: [...COMMON_HEADERS, "Risposta1", "Risposta2", "Risposta3"],
    example: [
      "Qual è la capitale della Francia?",
      30,
      1000,
      "N",
      "Parigi",
      "parigi",
      "",
    ],
  },
  {
    name: "Ordinamento",
    headers: [
      ...COMMON_HEADERS,
      "Elemento1",
      "Elemento2",
      "Elemento3",
      "Elemento4",
      "Elemento5",
      "Elemento6",
    ],
    example: [
      "Ordina i pianeti dal più vicino al Sole",
      45,
      1000,
      "N",
      "Mercurio",
      "Venere",
      "Terra",
      "Marte",
      "",
      "",
    ],
  },
  {
    name: "Stima Numerica",
    headers: [
      ...COMMON_HEADERS,
      "Valore Corretto",
      "Tolleranza",
      "Range Massimo",
      "Unità",
    ],
    example: [
      "Quanti abitanti ha l'Italia (in milioni)?",
      30,
      1000,
      "N",
      59,
      2,
      10,
      "milioni",
    ],
  },
] as const;

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF4F46E5" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const HEADER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
};

const MIN_COL_WIDTH = 15;

export async function generateQuizTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of SHEETS) {
    const ws = workbook.addWorksheet(sheet.name);

    // Add header row
    const headerRow = ws.addRow(sheet.headers);
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = HEADER_ALIGNMENT;
    });

    // Add example row
    ws.addRow(sheet.example);

    // Auto-width columns (min 15)
    ws.columns.forEach((col, i) => {
      const headerLen = String(sheet.headers[i] ?? "").length;
      const exampleLen = String(sheet.example[i] ?? "").length;
      const maxLen = Math.max(headerLen, exampleLen);
      col.width = Math.max(maxLen + 2, MIN_COL_WIDTH);
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
