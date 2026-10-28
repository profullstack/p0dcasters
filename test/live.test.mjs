import { expect, test } from "bun:test";
import { toStation, filterStations } from "../src/lib/live/radio.ts";
import { toChannel, filterChannels } from "../src/lib/live/tv.ts";
import { facet, httpsOnly } from "../src/lib/live/nichedb.ts";

const station = (over = {}) => ({
  id: 1,
  external_id: "uuid-1",
  title: "Radio Ö",
  url: "https://example.org/",
  image_url: "http://example.org/logo.png",
  tags: ["online"],
  data: {
    stationUuid: "uuid-1",
    name: "Radio Ö",
    streamUrl: "https://stream.example.org/live.mp3",
    online: true,
    countryCode: "at",
    country: "Austria",
    genres: ["Jazz", "news"],
    languages: ["german"],
    clicksLast24h: 12,
    votes: 3,
    ...over,
  },
});

test("an http-only station is left out: mixed content cannot play on https", () => {
  expect(toStation(station({ streamUrl: "http://stream.example.org/live.mp3", stream: null }))).toBeNull();
  expect(toStation(station({ online: false }))).toBeNull();
  const s = toStation(station());
  expect(s.stream).toBe("https://stream.example.org/live.mp3");
  expect(s.cc).toBe("AT");
  expect(s.genres).toEqual(["jazz", "news"]);
  // http artwork is upgraded, never passed through
  expect(s.logo).toBe("https://example.org/logo.png");
});

test("station filters fold case and diacritics", () => {
  const all = [toStation(station()), toStation(station({ stationUuid: "u2", name: "KEXP", countryCode: "US", genres: ["indie"] }))];
  expect(filterStations(all, { q: "radio o" }).map((s) => s.name)).toEqual(["Radio Ö"]);
  expect(filterStations(all, { country: "us" }).map((s) => s.name)).toEqual(["KEXP"]);
  expect(filterStations(all, { genre: "JAZZ" }).length).toBe(1);
  expect(facet(all, (s) => s.cc).map((f) => f.key).sort()).toEqual(["AT", "US"]);
});

const chan = (over = {}) => ({
  id: 2,
  external_id: "iptv-org:channel:Foo.us",
  title: "Foo TV",
  url: null,
  image_url: null,
  tags: ["channel", "news", "streamable"],
  data: {
    channelId: "Foo.us",
    country: "US",
    categories: ["news"],
    streamUrl: "http://plain.example/foo.m3u8",
    streams: [{ url: "http://plain.example/foo.m3u8" }, { url: "https://secure.example/foo.m3u8" }],
    ...over,
  },
});

test("a channel plays from its first https stream, or is not listed", () => {
  const c = toChannel(chan());
  expect(c.id).toBe("Foo.us");
  expect(c.stream).toBe("https://secure.example/foo.m3u8");
  expect(toChannel(chan({ streams: [] }))).toBeNull();
  expect(toChannel(chan({ isNsfw: true }))).toBeNull();
  expect(filterChannels([c], { category: "news", country: "us" }).length).toBe(1);
  expect(filterChannels([c], { q: "bar" }).length).toBe(0);
});

test("httpsOnly", () => {
  expect(httpsOnly("http://x.example/a")).toBeNull();
  expect(httpsOnly("not a url")).toBeNull();
  expect(httpsOnly(" https://x.example/a ")).toBe("https://x.example/a");
});

test("label capitalises words with accented letters intact", async () => {
  const { label } = await import("../src/lib/live/nichedb.ts");
  expect(label("américa")).toBe("América");
  expect(label("estación latina")).toBe("Estación Latina");
  expect(label("80s rock")).toBe("80s Rock");
});
