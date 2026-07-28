"use client";
// One sortable, row-selectable table, fed column definitions. Both desk tables use it, so
// sorting, selection and cell alignment behave identically in each.
//
// A column definition carries:
//   key        sort id
//   label      header text
//   accessor   pulls the sort value from a row (numbers sort numerically, strings by locale)
//   render     optional cell content (defaults to the accessor's value)
//   cellClass  optional extra <td> class, appended after the alignment base
//   headClass  optional extra <th> class (used to mark a model-driven column)
//   align      "left" opts a column out of the right-aligned numeric base
//   sticky     pins the column while the table scrolls horizontally
//   tip        optional ⓘ header tooltip
import { useState } from "react";
import { InfoTip } from "./InfoTip";

export function SortableTable({
  columns, rows, rowKey, defaultSort, selectedKey, onSelectRow, tall,
}) {
  const [sort, setSort] = useState(defaultSort);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const sortColumn = columns.find((c) => c.key === sort.key);
  const sorted = [...rows].sort((a, b) => {
    const av = sortColumn.accessor(a);
    const bv = sortColumn.accessor(b);
    const cmp =
      typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv))
        : (av ?? -Infinity) - (bv ?? -Infinity);
    return sort.dir === "asc" ? cmp : -cmp;
  });

  // `tall` bounds the body height and scrolls it (a 30-name book) while leaving the
  // panel's reserved outer space unchanged; the header row stays sticky.
  return (
    <div className={`table-scroll ${tall ? "tall" : ""}`}>
      <table className="terminal-data-table sortable">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={[c.sticky ? "sticky-col" : "", c.headClass || ""].filter(Boolean).join(" ") || undefined}
                style={{ textAlign: c.align || "right", cursor: "pointer", whiteSpace: "nowrap" }}
                onClick={() => toggleSort(c.key)}
              >
                {c.label}
                {c.tip && <InfoTip text={c.tip} />}
                <span className="sort-caret">{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={`selectable ${key === selectedKey ? "selected" : ""}`}
                onClick={() => onSelectRow && onSelectRow(row)}
              >
                {columns.map((c) => {
                  const className = [
                    c.align === "left" ? "" : "num",
                    c.cellClass ? c.cellClass(row) : "",
                    c.sticky ? "sticky-col" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <td key={c.key} className={className}>
                      {c.render ? c.render(row) : c.accessor(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
