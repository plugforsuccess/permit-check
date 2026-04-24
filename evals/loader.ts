import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { goldenFixtureSchema, type GoldenFixture } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, "golden-set");

export function loadFixtures(): GoldenFixture[] {
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf-8"));
    const parsed = goldenFixtureSchema.parse(raw);
    return parsed as GoldenFixture;
  });
}

export function loadFixtureById(id: string): GoldenFixture {
  const all = loadFixtures();
  const found = all.find((f) => f.id === id);
  if (!found) throw new Error(`Fixture not found: ${id}`);
  return found;
}
