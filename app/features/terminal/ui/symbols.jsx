"use client";
// The desk uppercases its labels for the terminal look, but a Greek letter is a SYMBOL,
// not a word: `text-transform: uppercase` maps α/β/ν to Α/Β/Ν, which read as Latin A/B/N
// and so name the wrong parameter. Splitting on the Greek block lets the transform apply
// to the Latin part only ("DCC α", never "DCC A").
const GREEK_RANGE = /([Ͱ-Ͽ])/g;

export function symbolize(text) {
  return text
    .split(GREEK_RANGE)
    .map((part, i) => (i % 2 ? <span key={i} className="sym">{part}</span> : part));
}
