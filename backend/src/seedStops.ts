import type { SQL } from "bun";

/*
 * Jeden řádek připravený pro vložení do databáze.
 */
type StopSeedRow = {
  id: number;
  name: string;
  lines: string;
  isTransfer: boolean;
  transferLines: string | null;
  x: number;
  y: number;
  wheelchairAccessible: boolean;
  hasShelter: boolean;
  hasBench: boolean;
  hasTicketMachine: boolean;
  hasDisplay: boolean;
  imageUrl: string | null;
};

const EXPECTED_STOP_COUNT = 15;

/*
 * Ve stops.csv je image_url prázdné, proto zde přiřadíme
 * veřejné URL obrázků uložených ve frontend/public/stops.
 *
 * Uprav názvy nebo přípony podle skutečných souborů
 * rozbalených ze stopsImages.zip.
 */
const stopImages: Record<string, string> = {
  "Turing Terminal": "/stops/turingTerminal.png",
  "Ada Exchange": "/stops/adaExchange.png",
  "Pixel Park": "/stops/pixelPark.png",
  "Byte Square": "/stops/byteSquare.png",
  "Stack Garden": "/stops/stackGarden.png",
  "Hopper Hall": "/stops/hopperHall.png",
  "Compiler Court": "/stops/compilerCourt.png",
  "Kernel Hub": "/stops/kernelHub.png",
  "Syntax Square": "/stops/syntaxSquare.png",
  "Lambda Lane": "/stops/lambdaLane.png",
  "Campus Gate": "/stops/campusGate.png",
  "Edison East": "/stops/edisonEast.png",
  "Notebook Quay": "/stops/notebookQuay.png",
  "Library Loop": "/stops/libraryLoop.png",
  "Quantum Commons": "/stops/quantumCommons.png",
};

/*
 * Převod textové hodnoty true/false z CSV.
 */
function parseBoolean(
  value: string,
  column: string,
  rowNumber: number,
): boolean {
  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(
    `Invalid boolean "${value}" in column "${column}" on CSV row ${rowNumber}.`,
  );
}

/*
 * Převod čísla z CSV.
 */
function parseNumber(
  value: string,
  column: string,
  rowNumber: number,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid number "${value}" in column "${column}" on CSV row ${rowNumber}.`,
    );
  }

  return parsed;
}

/*
 * Načte a zkontroluje stops.csv.
 *
 * Předpokládaná struktura:
 *
 * /app/src/seedStops.ts
 * /app/seed-data/stops.csv
 *
 * Proto používáme cestu ../seed-data/stops.csv.
 */
async function loadStopsFromCsv(): Promise<StopSeedRow[]> {
  const csvUrl = new URL(
    "../seed-data/stops.csv",
    import.meta.url,
  );

  const csvFile = Bun.file(csvUrl);

  if (!(await csvFile.exists())) {
    throw new Error(
      `Seed file was not found: ${csvUrl.pathname}`,
    );
  }

  const content = (await csvFile.text())
    .replace(/^\uFEFF/, "")
    .trim();

  if (!content) {
    throw new Error("stops.csv is empty.");
  }

  const csvLines = content.split(/\r?\n/);

  if (csvLines.length < 2) {
    throw new Error(
      "stops.csv does not contain any stop records.",
    );
  }

  const headers = csvLines[0]
    .split(",")
    .map((value) => value.trim());

  const requiredColumns = [
    "id",
    "name",
    "lines",
    "is_transfer",
    "transfer_lines",
    "x",
    "y",
    "wheelchair_accessible",
    "has_shelter",
    "has_bench",
    "has_ticket_machine",
    "has_display",
    "image_url",
  ];

  const columnIndexes = Object.fromEntries(
    headers.map((header, index) => [
      header,
      index,
    ]),
  ) as Record<string, number>;

  for (const column of requiredColumns) {
    if (columnIndexes[column] === undefined) {
      throw new Error(
        `Required column "${column}" is missing from stops.csv.`,
      );
    }
  }

  const stops = csvLines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((csvLine, index): StopSeedRow => {
      /*
       * +2, protože:
       * - index začíná od nuly,
       * - první řádek CSV obsahuje hlavičku.
       */
      const rowNumber = index + 2;

      /*
       * Dodané CSV nepoužívá čárky uvnitř hodnot.
       * Vícenásobné linky používají středník, například A;B.
       */
      const values = csvLine
        .split(",")
        .map((value) => value.trim());

      const getValue = (column: string): string => {
        const columnIndex = columnIndexes[column];

        return values[columnIndex] ?? "";
      };

      const id = parseNumber(
        getValue("id"),
        "id",
        rowNumber,
      );

      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(
          `Invalid stop ID "${id}" on CSV row ${rowNumber}.`,
        );
      }

      const name = getValue("name");

      if (!name) {
        throw new Error(
          `Stop name is missing on CSV row ${rowNumber}.`,
        );
      }

      /*
       * Pokud je image_url vyplněné přímo v CSV,
       * má přednost před mapou stopImages.
       */
      const csvImageUrl = getValue("image_url");

      const imageUrl =
        csvImageUrl.length > 0
          ? csvImageUrl
          : stopImages[name] ?? null;

      if (imageUrl === null) {
        throw new Error(
          `No image is assigned to stop "${name}".`,
        );
      }

      return {
        id,
        name,
        lines: getValue("lines"),

        isTransfer: parseBoolean(
          getValue("is_transfer"),
          "is_transfer",
          rowNumber,
        ),

        transferLines:
          getValue("transfer_lines") || null,

        x: parseNumber(
          getValue("x"),
          "x",
          rowNumber,
        ),

        y: parseNumber(
          getValue("y"),
          "y",
          rowNumber,
        ),

        wheelchairAccessible: parseBoolean(
          getValue("wheelchair_accessible"),
          "wheelchair_accessible",
          rowNumber,
        ),

        hasShelter: parseBoolean(
          getValue("has_shelter"),
          "has_shelter",
          rowNumber,
        ),

        hasBench: parseBoolean(
          getValue("has_bench"),
          "has_bench",
          rowNumber,
        ),

        hasTicketMachine: parseBoolean(
          getValue("has_ticket_machine"),
          "has_ticket_machine",
          rowNumber,
        ),

        hasDisplay: parseBoolean(
          getValue("has_display"),
          "has_display",
          rowNumber,
        ),

        imageUrl,
      };
    });

  if (stops.length !== EXPECTED_STOP_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_STOP_COUNT} stops, but stops.csv contains ${stops.length}.`,
    );
  }

  const stopIds = new Set<number>();
  const stopNames = new Set<string>();

  for (const stop of stops) {
    if (stopIds.has(stop.id)) {
      throw new Error(
        `Duplicate stop ID ${stop.id} in stops.csv.`,
      );
    }

    if (stopNames.has(stop.name)) {
      throw new Error(
        `Duplicate stop name "${stop.name}" in stops.csv.`,
      );
    }

    stopIds.add(stop.id);
    stopNames.add(stop.name);
  }

  return stops;
}

/*
 * Veřejná seedovací funkce volaná z index.ts.
 *
 * Používá ON DUPLICATE KEY UPDATE:
 * - při prvním startu vytvoří výchozí zastávky,
 * - při dalším startu je nevytvoří podruhé,
 * - pokud se CSV změní, aktualizuje databázové hodnoty.
 */
export async function seedStops(
  sql: SQL,
): Promise<void> {
  const stops = await loadStopsFromCsv();

  for (const stop of stops) {
    await sql`
      INSERT INTO stops (
        id,
        name,
        image_url,
        wheelchair_accessible,
        has_shelter,
        has_ticket_machine,
        lines,
        is_transfer,
        transfer_lines,
        x,
        y,
        has_bench,
        has_display
      )
      VALUES (
        ${stop.id},
        ${stop.name},
        ${stop.imageUrl},
        ${stop.wheelchairAccessible},
        ${stop.hasShelter},
        ${stop.hasTicketMachine},
        ${stop.lines},
        ${stop.isTransfer},
        ${stop.transferLines},
        ${stop.x},
        ${stop.y},
        ${stop.hasBench},
        ${stop.hasDisplay}
      )
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        image_url = VALUES(image_url),
        wheelchair_accessible =
          VALUES(wheelchair_accessible),
        has_shelter = VALUES(has_shelter),
        has_ticket_machine =
          VALUES(has_ticket_machine),
        lines = VALUES(lines),
        is_transfer = VALUES(is_transfer),
        transfer_lines = VALUES(transfer_lines),
        x = VALUES(x),
        y = VALUES(y),
        has_bench = VALUES(has_bench),
        has_display = VALUES(has_display)
    `;
  }

  /*
   * Kontrola, že všechna výchozí ID z CSV
   * skutečně existují v databázi.
   *
   * Nekontrolujeme celkový počet řádků v tabulce,
   * protože uživatel může přes POST vytvořit další zastávky.
   */
const verificationResult = await sql`
  SELECT COUNT(*) AS count
  FROM stops
  WHERE id BETWEEN 1 AND 15
`;

const count = Number(
  verificationResult[0]?.count ?? 0,
);

if (count !== EXPECTED_STOP_COUNT) {
  throw new Error(
    `Seed verification failed. Expected ${EXPECTED_STOP_COUNT} default stops, found ${count}.`,
  );
}

console.log(
  `Stop seed completed: ${count} default stops are available.`,
);
