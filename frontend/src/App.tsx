// frontend/src/App.tsx
import { useEffect, useState } from "react";
import {
  getHealth,
  getStops,
  type Stop,
} from "./api";

export default function App() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [health, loadedStops] = await Promise.all([
          getHealth(),
          getStops(),
        ]);

        setStatus(health.status.toUpperCase());
        setStops(loadedStops);
      } catch (caughtError) {
        setStatus("ERROR");
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unknown error",
        );
      }
    }

    void loadData();
  }, []);

  return (
    <main>
      <h1>Public transport stops</h1>
      <p>Status: {status}</p>

      {error && (
        <p role="alert">
          Nepodařilo se načíst data: {error}
        </p>
      )}

      <section className="stops">
        {stops.map((stop) => (
          <article className="stop-card" key={stop.id}>
            <img
              src={stop.imageUrl}
              alt={stop.name}
              loading="lazy"
              width={320}
              height={200}
            />

            <h2>{stop.name}</h2>

            <p>
              Linky:{" "}
              <strong>{stop.lines.join(", ")}</strong>
            </p>

            {stop.isTransfer && (
              <p>
                Přestupní zastávka:{" "}
                {stop.transferLines.join(", ")}
              </p>
            )}

            <dl>
              <dt>Bezbariérová</dt>
              <dd>
                {stop.wheelchairAccessible ? "Ano" : "Ne"}
              </dd>

              <dt>Přístřešek</dt>
              <dd>{stop.hasShelter ? "Ano" : "Ne"}</dd>

              <dt>Lavička</dt>
              <dd>{stop.hasBench ? "Ano" : "Ne"}</dd>

              <dt>Automat na lístky</dt>
              <dd>
                {stop.hasTicketMachine ? "Ano" : "Ne"}
              </dd>

              <dt>Informační displej</dt>
              <dd>{stop.hasDisplay ? "Ano" : "Ne"}</dd>
            </dl>
          </article>
        ))}
      </section>
    </main>
  );
}
