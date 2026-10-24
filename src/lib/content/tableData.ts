export type Rows = string[][];

export function tableSize(rows: Rows): { rows: number; cols: number } {
  return { rows: rows.length, cols: Math.max(0, ...rows.map((row) => row.length)) };
}

export function setCell(rows: Rows, row: number, col: number, text: string): Rows {
  return rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? text : cell)) : cells));
}

export function insertRow(rows: Rows, at: number): Rows {
  const next = [...rows];
  next.splice(at, 0, Array<string>(tableSize(rows).cols).fill(""));
  return next;
}

export function deleteRow(rows: Rows, at: number): Rows {
  return rows.length <= 1 ? rows : rows.filter((_, r) => r !== at);
}

export function insertColumn(rows: Rows, at: number): Rows {
  return rows.map((cells) => [...cells.slice(0, at), "", ...cells.slice(at)]);
}

export function deleteColumn(rows: Rows, at: number): Rows {
  return tableSize(rows).cols <= 1 ? rows : rows.map((cells) => cells.filter((_, c) => c !== at));
}
