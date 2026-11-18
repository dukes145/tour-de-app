import { cors } from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import { SQL } from "bun";
import { seedStops } from "./seedStops";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const sql = new SQL(databaseUrl, {
  allowPublicKeyRetrieval: true,
});

/*
 * Datový typ odpovídající řádku načtenému z MySQL.
 * Hodnoty jsou unknown, protože databázový ovladač může
 * vracet čísla a booleany v různých reprezentacích.
 */
type StopDatabaseRow = {
  id: unknown;
  name: unknown;
  image_url: unknown;
  wheelchair_accessible: unknown;
  has_shelter: unknown;
  has_ticket_machine: unknown;
};

/*
 * Převod MySQL BOOLEAN/TINYINT hodnoty na JavaScript boolean.
 */
function databaseBoolean(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

/*
 * Převod databázového řádku do přesného formátu
 * definovaného ve Swagger specifikaci.
 */
function serializeStop(row: StopDatabaseRow) {
  return {
    id: Number(row.id),
    name: String(row.name),

    image_url:
      row.image_url === null ||
      row.image_url === undefined ||
      row.image_url === ""
        ? null
        : String(row.image_url),

    wheelchair_accessible: databaseBoolean(
      row.wheelchair_accessible,
    ),

    has_shelter: databaseBoolean(
      row.has_shelter,
    ),

    has_ticket_machine: databaseBoolean(
      row.has_ticket_machine,
    ),
  };
}

/*
 * Pomocná funkce pro získání ID vytvořeného MySQL.
 *
 * Různé verze Bun SQL mohou používat insertId
 * nebo lastInsertRowid.
 */
function getInsertedId(result: unknown): number {
  const record = result as {
    insertId?: unknown;
    lastInsertRowid?: unknown;
  };

  const id = Number(
    record.insertId ?? record.lastInsertRowid,
  );

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(
      "Database did not return the inserted stop ID.",
    );
  }

  return id;
}

/*
 * Validace těla POST a PUT.
 *
 * ID zde úmyslně není. ID generuje databáze
 * a klient ho při vytvoření ani aktualizaci neposílá.
 *
 * image_url není povinné, ale pokud je uvedené,
 * musí být string nebo null.
 */
const StopInputSchema = t.Object(
  {
    name: t.String({
      minLength: 1,
      maxLength: 100,
    }),

    image_url: t.Optional(
      t.Nullable(
        t.String({
          maxLength: 2048,
        }),
      ),
    ),

    wheelchair_accessible: t.Boolean(),
    has_shelter: t.Boolean(),
    has_ticket_machine: t.Boolean(),
  },
  {
    additionalProperties: false,
  },
);

const StopIdSchema = t.Object({
  id: t.Numeric({
    minimum: 1,
  }),
});

/*
 * Inicializace databáze.
 *
 * Tour de App může nastartovat backend dříve než MySQL,
 * proto se připojení zkouší maximálně 60krát.
 */
let databaseInitialized = false;

for (let attempt = 1; attempt <= 60; attempt++) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS product (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        cost INT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tym (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nazev_tymu VARCHAR(100) NOT NULL,
        jmeno_clena VARCHAR(100) NOT NULL
      )
    `;

    /*
     * Tabulka zachovává také interní hodnoty ze seedovacího CSV.
     * REST API ale vrací pouze pole požadovaná Swaggerem.
     *
     * ID je AUTO_INCREMENT, takže POST může vytvořit nové ID.
     * Seed přitom může nadále vkládat explicitní ID 1 až 15.
     */
    await sql`
      CREATE TABLE IF NOT EXISTS stops (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        image_url VARCHAR(2048) NULL,
        wheelchair_accessible BOOLEAN NOT NULL,
        has_shelter BOOLEAN NOT NULL,
        has_ticket_machine BOOLEAN NOT NULL,

        lines VARCHAR(50) NOT NULL DEFAULT '',
        is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
        transfer_lines VARCHAR(50) NULL,
        x DECIMAL(10, 2) NULL,
        y DECIMAL(10, 2) NULL,
        has_bench BOOLEAN NOT NULL DEFAULT FALSE,
        has_display BOOLEAN NOT NULL DEFAULT FALSE
      )
    `;

    /*
     * Tým vložíme pouze do prázdné tabulky.
     */
    const teamCountResult = await sql`
      SELECT COUNT(*) AS count
      FROM tym
    `;

    if (Number(teamCountResult[0]?.count ?? 0) === 0) {
      await sql`
        INSERT INTO tym (
          nazev_tymu,
          jmeno_clena
        )
        VALUES
          ('Super Kodéři', 'Jakub Polák'),
          ('Super Kodéři', 'Tomáš Heran'),
          ('Super Kodéři', 'Boris Esdee Boťur')
      `;
    }

    /*
     * Seed je idempotentní.
     * Výchozí zastávky vloží nebo aktualizuje při každém startu.
     */
    await seedStops(sql);

    databaseInitialized = true;

    console.log("Database initialized.");
    break;
  } catch (error) {
    console.error(
      `Database initialization attempt ${attempt}/60 failed:`,
      error,
    );

    if (attempt === 60) {
      throw error;
    }

    await Bun.sleep(1000);
  }
}

if (!databaseInitialized) {
  throw new Error("Database initialization failed.");
}

const port = Number(process.env.PORT ?? 3001);

const app = new Elysia()
  .use(
    cors({
      origin: true,
      methods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS",
      ],
      allowedHeaders: ["Content-Type"],
    }),
  )

  /*
   * Pomocný health endpoint.
   */
  .get("/api/v1/health", () => {
    return {
      status: "ok",
    };
  })

  /*
   * Původní endpoint s informacemi o týmu.
   */
  .get("/api/v1/tym", async () => {
    const rows = await sql`
      SELECT
        nazev_tymu,
        jmeno_clena
      FROM tym
      ORDER BY id
    `;

    const teamRows = [...rows];

    return {
      tym:
        teamRows.length > 0
          ? String(teamRows[0].nazev_tymu)
          : "Neznámý tým",

      clenove: teamRows.map((row) =>
        String(row.jmeno_clena),
      ),
    };
  })

  /*
   * GET /api/v1/stops
   *
   * Vrátí seznam všech zastávek.
   * Výchozí status je 200 OK.
   */
  .get("/api/v1/stops", async () => {
    const rows = await sql`
      SELECT
        id,
        name,
        image_url,
        wheelchair_accessible,
        has_shelter,
        has_ticket_machine
      FROM stops
      ORDER BY id
    `;

    return [...rows].map((row) =>
      serializeStop(row as StopDatabaseRow),
    );
  })

  /*
   * GET /api/v1/stops/:id
   *
   * Vrátí detail jedné zastávky.
   */
  .get(
    "/api/v1/stops/:id",
    async ({ params, set }) => {
      const rows = await sql`
        SELECT
          id,
          name,
          image_url,
          wheelchair_accessible,
          has_shelter,
          has_ticket_machine
        FROM stops
        WHERE id = ${params.id}
        LIMIT 1
      `;

      if (rows.length === 0) {
        set.status = 404;

        return {
          message: "Stop not found.",
        };
      }

      return serializeStop(
        rows[0] as StopDatabaseRow,
      );
    },
    {
      params: StopIdSchema,
    },
  )

  /*
   * POST /api/v1/stops
   *
   * Vytvoří zastávku.
   * ID generuje MySQL.
   * Vrací 201 Created a vytvořenou zastávku.
   */
  .post(
    "/api/v1/stops",
    async ({ body, set }) => {
      const result = await sql`
        INSERT INTO stops (
          name,
          image_url,
          wheelchair_accessible,
          has_shelter,
          has_ticket_machine
        )
        VALUES (
          ${body.name},
          ${body.image_url ?? null},
          ${body.wheelchair_accessible},
          ${body.has_shelter},
          ${body.has_ticket_machine}
        )
      `;

      const insertedId = getInsertedId(result);

      const rows = await sql`
        SELECT
          id,
          name,
          image_url,
          wheelchair_accessible,
          has_shelter,
          has_ticket_machine
        FROM stops
        WHERE id = ${insertedId}
        LIMIT 1
      `;

      if (rows.length === 0) {
        set.status = 500;

        return {
          message: "Created stop could not be loaded.",
        };
      }

      set.status = 201;

      return serializeStop(
        rows[0] as StopDatabaseRow,
      );
    },
    {
      body: StopInputSchema,
    },
  )

  /*
   * PUT /api/v1/stops/:id
   *
   * Nahradí všechna veřejná data existující zastávky.
   * Klient musí poslat kompletní StopInput.
   */
  .put(
    "/api/v1/stops/:id",
    async ({ params, body, set }) => {
      const existingRows = await sql`
        SELECT id
        FROM stops
        WHERE id = ${params.id}
        LIMIT 1
      `;

      if (existingRows.length === 0) {
        set.status = 404;

        return {
          message: "Stop not found.",
        };
      }

      await sql`
        UPDATE stops
        SET
          name = ${body.name},
          image_url = ${body.image_url ?? null},
          wheelchair_accessible =
            ${body.wheelchair_accessible},
          has_shelter = ${body.has_shelter},
          has_ticket_machine =
            ${body.has_ticket_machine}
        WHERE id = ${params.id}
      `;

      const updatedRows = await sql`
        SELECT
          id,
          name,
          image_url,
          wheelchair_accessible,
          has_shelter,
          has_ticket_machine
        FROM stops
        WHERE id = ${params.id}
        LIMIT 1
      `;

      return serializeStop(
        updatedRows[0] as StopDatabaseRow,
      );
    },
    {
      params: StopIdSchema,
      body: StopInputSchema,
    },
  )

  /*
   * DELETE /api/v1/stops/:id
   *
   * Smaže zastávku.
   * Vrací 204 No Content bez response body.
   */
  .delete(
    "/api/v1/stops/:id",
    async ({ params, set }) => {
      const existingRows = await sql`
        SELECT id
        FROM stops
        WHERE id = ${params.id}
        LIMIT 1
      `;

      if (existingRows.length === 0) {
        set.status = 404;

        return {
          message: "Stop not found.",
        };
      }

      await sql`
        DELETE FROM stops
        WHERE id = ${params.id}
      `;

      set.status = 204;

      /*
       * U 204 se nesmí vracet JSON ani text.
       */
      return;
    },
    {
      params: StopIdSchema,
    },
  )

  /*
   * Jednotné zachycení neočekávaných chyb.
   */
  .onError(({ code, error, set }) => {
    console.error(`Request failed with code ${code}:`, error);

    /*
     * Validační chyby vytvořené Elysia ponecháme
     * jako 422 Unprocessable Content.
     */
    if (code === "VALIDATION") {
      return;
    }

    /*
     * Pokud už endpoint nastavil například 404,
     * nepřepisujeme ho na 500.
     */
    if (
      typeof set.status === "number" &&
      set.status >= 400
    ) {
      return;
    }

    set.status = 500;

    return {
      message: "Internal server error.",
    };
  })

  .listen({
    port,
    hostname: "0.0.0.0",
  });

console.log(
  `Server running at http://${app.server?.hostname}:${app.server?.port}`,
);
