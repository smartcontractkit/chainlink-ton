import { beginCell, Cell } from "@ton/core"


export function listOfHashesAsCell(list: bigint[]): Cell {
  let nodes = Math.floor(list.length / 3)
  
  let hashesInLastCell = list.length % 3

  let lastCell = beginCell()
  for (let i = list.length-hashesInLastCell; i < list.length; i++) {
    lastCell.storeUint(list[i], 256)
  }
  for (let i = 0; i < 3 - hashesInLastCell; i++) {
    lastCell.storeUint(0, 256)
  }

  // all other cells have 3 hashes and a reference to the next cell, we will build from the tail (lastCell) to the head
  for (let i = nodes - 1; i >= 0; i--) {
    let cell = beginCell()
    for (let j = 0; j < 3; j++) {
      cell.storeUint(list[i * 3 + j], 256)
    }
    cell.storeRef(lastCell);
    lastCell = cell;
  }
  return lastCell.endCell()
}


