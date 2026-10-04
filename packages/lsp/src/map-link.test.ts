import { describe, expect, it } from "vitest"
import { DiagnosticSeverity } from "vscode-languageserver/node"

import { mapLinkActions, mapLinkDiagnostics } from "./map-link"

const TOKYO = "https://www.google.com/maps/@35.6812,139.7671,15z"
const STATION =
  "https://www.google.com/maps/place/%E6%9D%B1%E4%BA%AC%E9%A7%85/@35.6812,139.7671,17.5z/data=!3m1"

/** What each diagnostic points at, read back out of `text` by its range. */
const flagged = (text: string) =>
  mapLinkDiagnostics(text, { severity: "information" }).map(
    ({ range }) =>
      text.split("\n")[range.start.line]?.slice(range.start.character, range.end.character) ?? "",
  )

/** The text the quick fix at the first character of `needle` would write in its place. */
const fixAt = (text: string, needle: string) => {
  const lines = text.split("\n")
  const line = lines.findIndex((l) => l.includes(needle))
  const character = (lines[line] ?? "").indexOf(needle)
  const position = { line, character }
  return mapLinkActions("file:///w/a.csn", text, { start: position, end: position }, {}).map(
    ({ edit }) => edit?.changes?.["file:///w/a.csn"]?.[0]?.newText,
  )
}

describe("mapLinkDiagnostics", () => {
  it("flags a Google Maps URL written as a link, which Cosense would write as a map", () => {
    expect(flagged(`T\n場所は ${TOKYO} です`)).toEqual([TOKYO])
  })

  it("flags the whole bracket of one written in brackets", () => {
    expect(flagged(`T\n[${TOKYO}]`)).toEqual([`[${TOKYO}]`])
  })

  it("says what the map would be written as", () => {
    const [diagnostic] = mapLinkDiagnostics(`T\n${TOKYO}`, { severity: "information" })
    expect(diagnostic?.message).toBe(
      "Google マップの URL は地図の記法にできる: [N35.6812,E139.7671,Z15]",
    )
  })

  it("is as loud as the setting says", () => {
    const [diagnostic] = mapLinkDiagnostics(`T\n${TOKYO}`, { severity: "hint" })
    expect(diagnostic?.severity).toBe(DiagnosticSeverity.Hint)
  })

  it("says nothing when switched off", () => {
    expect(mapLinkDiagnostics(`T\n${TOKYO}`, { severity: "off" })).toEqual([])
  })

  it("leaves a link given a label of its own alone, since the label was chosen", () => {
    expect(flagged(`T\n[東京駅 ${TOKYO}]`)).toEqual([])
  })

  it("leaves a URL in code alone, which is how to keep one as it is", () => {
    expect(flagged(`T\n\`${TOKYO}\`\ncode:a.txt\n ${TOKYO}`)).toEqual([])
  })

  it("leaves a Maps URL without coordinates alone", () => {
    expect(flagged("T\nhttps://www.google.com/maps/search/%E6%9D%B1%E4%BA%AC%E9%A7%85")).toEqual([])
  })

  it("leaves Google URLs that are not Maps alone", () => {
    expect(flagged("T\nhttps://www.google.com/travel/hotels/@35.6812,139.7671,15z")).toEqual([])
  })

  it("leaves a Maps URL on another host alone, as Cosense Web does", () => {
    expect(flagged("T\nhttps://maps.google.com/maps/@35.6812,139.7671,15z")).toEqual([])
  })
})

describe("mapLinkActions", () => {
  it("writes the coordinates and the zoom in place of the URL", () => {
    expect(fixAt(`T\n場所は ${TOKYO} です`, "https")).toEqual(["[N35.6812,E139.7671,Z15]"])
  })

  it("replaces the brackets too", () => {
    expect(fixAt(`T\n[${TOKYO}]`, "https")).toEqual(["[N35.6812,E139.7671,Z15]"])
  })

  it("keeps the place's name as the label and rounds the zoom down, as Cosense Web does", () => {
    expect(fixAt(`T\n${STATION}`, "https")).toEqual(["[N35.6812,E139.7671,Z17 東京駅]"])
  })

  it("reads a + in the place's name as a space", () => {
    expect(
      fixAt("T\nhttps://www.google.com/maps/place/Tokyo+Station/@35.6812,139.7671,17z", "https"),
    ).toEqual(["[N35.6812,E139.7671,Z17 Tokyo Station]"])
  })

  it("writes south and west as S and W", () => {
    expect(fixAt("T\nhttps://www.google.com/maps/@-33.8568,-151.2153,12z", "https")).toEqual([
      "[S33.8568,W151.2153,Z12]",
    ])
  })

  it("writes no zoom when the URL has none", () => {
    expect(fixAt("T\nhttps://www.google.co.jp/maps/@35.6812,139.7671", "https")).toEqual([
      "[N35.6812,E139.7671]",
    ])
  })

  it("offers nothing away from a Maps URL", () => {
    expect(fixAt(`T\n場所は ${TOKYO} です`, "場所")).toEqual([])
  })
})
