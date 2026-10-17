import { expect, test } from "bun:test";
import { safeImage } from "../src/lib/format.ts";

test("safeImage drops artwork known to 404", () => {
  expect(safeImage("http://tilos.hu/upload/episode-new/roadmovie.jpg")).toBe("");
  expect(safeImage("https://tilos.hu/upload/episode-new/paholy.jpg")).toBe(
    "https://tilos.hu/upload/episode-new/paholy.jpg",
  );
});
