import { Cell } from '@ton/core'

export class StorageStats {
  bits: bigint
  cells: bigint

  constructor(bits?: number | bigint, cells?: number | bigint) {
    this.bits = bits !== undefined ? BigInt(bits) : 0n
    this.cells = cells !== undefined ? BigInt(cells) : 0n
  }
  add(...stats: StorageStats[]) {
    let cells = this.cells,
      bits = this.bits
    for (let stat of stats) {
      bits += stat.bits
      cells += stat.cells
    }
    return new StorageStats(bits, cells)
  }
  addBits(bits: number | bigint) {
    return new StorageStats(this.bits + BigInt(bits), this.cells)
  }
  addCells(cells: number | bigint) {
    return new StorageStats(this.bits, this.cells + BigInt(cells))
  }
}

export function collectCellStats(
  cell: Cell,
  visited: Array<string>,
  skipRoot: boolean = false,
): StorageStats {
  let bits = skipRoot ? 0n : BigInt(cell.bits.length)
  let cells = skipRoot ? 0n : 1n
  const hash = cell.hash().toString()
  if (visited.includes(hash)) {
    return new StorageStats()
  }
  visited.push(hash)
  for (const ref of cell.refs) {
    const r = collectCellStats(ref, visited)
    cells += r.cells
    bits += r.bits
  }
  return new StorageStats(bits, cells)
}

export function calcStorageFee(prices: StorageValue, stats: StorageStats, duration: bigint) {
  return shr16ceil(
    (stats.bits * prices.bit_price_ps + stats.cells * prices.cell_price_ps) * duration,
  )
}

type StorageValue = {
  bit_price_ps: bigint
  cell_price_ps: bigint
}

function shr16ceil(src: bigint) {
  const rem = src % 65536n
  let res = src / 65536n
  if (rem !== 0n) res += 1n
  return res
}

const bytecodeBoc = Cell.fromBoc(
  Buffer.from(
    'b5ee9c7201020e01000282000114ff00f4a413f4bcf2c80b0102016202030240d0f891f24020d72c201c76f48ce302d72c200cfa6694e30230840f01c700f2f404050201480a0b01f831ed44d0d3fffa48d33fd33fd33fd37fd70b0f8200bb1df89227c705f2f407d4d31fd3ffd3000193fa003092306de203d020d3ff31d33f31d33f31d70b3f8200bb215318be955317bbc3009170e2f2f45307a18200bb2121c140f2f47321aa00ac27b001aa00ad8200bb1f21c003917f9521c000c300e2f2f4256eb30601fe31ed44d0d3fffa48d33fd33fd33fd37fd70b0f8200bb1df89227c705f2f407d33fd70b0720c203f2458200bb215325be955324bbc3009170e2f2f45314a18200bb2121c140f2f47321aa00ac24b001aa00ad8200bb2001c302f2f48200bb2021c002917f9521c003c300e2f2f48200bb215325be955324bbc3009170e2f2f40801fe8e17f8232aa15005bc8200bb1e01917f9524c003c300e2f2f49a348200bb1c24c000f2f4e28200bb215318be955317bbc3009170e2f2f427a18200bb2121c140f2f47321aa00acb316b005aa00ae15b104c8cec9c8cf931cf56a2acc29cf0bffcbff226e946c12cf8195cf8358fa02e2cb07c9c8cf85885260fa5271cf0b6e070036ccc98040fb0005c8cbff14fa5212cb3fcb3fcb3fcb7fcb0fc9ed5401aa5114a18200bb2121c140f2f47321aa00acb313b002aa005210ac12b101c0029306a406de5312a1a427ba8e9388c8cf85885260fa5271cf0b6eccc98306fb00de05c8cbff14fa5212cb3fcb3fcb3fcb7fcb0fc9ed540900000201200c0d000bb86858101df8005bb62bf1a10b1b7b69731b430b4b73634b735973a37b71731b1b4b81726b2b935b632a937b7ba4116a625c6c5c6110001bb5c51040176394041081f77e5090',
    'hex',
  ),
)
console.log(bytecodeBoc.length)
const bytecodeCell = bytecodeBoc[0]

const dataBoc = Cell.fromBoc(
  Buffer.from(
    'b5ee9c7201010101006e0000d7893fe577139b8798ef5d51e46acde20c46e9dd548ee8b02539f356728170c5868005b0c54f666b5c9e51035a9f74006688eb187d54de454f0b0023aa1a96fb6825600000000d30487a0000000000000031600000000000003160000000000000000000000000000000400030',
    'hex',
  ),
)
console.log(dataBoc.length)
const dataCell = dataBoc[0]

const codeStats = collectCellStats(bytecodeCell, [], false)
console.log('code: ', codeStats)
const dataStats = collectCellStats(dataCell, [], false)
console.log('data:', dataStats)

const storageValues = {
  bit_price_ps: 1n,
  cell_price_ps: 500n,
}

// durations of 1 day 1 week 1 month 1 year in seconds
const durations = [86400n, 604800n, 2592000n, 31536000n, 31536000n * 15n]

const fees = durations.map((duration) => {
  const codeFee = calcStorageFee(storageValues, codeStats, duration)
  const dataFee = calcStorageFee(storageValues, dataStats, duration)
  return {
    duration,
    codeFee,
    dataFee,
    totalFee: codeFee + dataFee,
  }
})

fees.forEach((fee) => {
  console.log(`Duration: ${fee.duration} seconds`)
  console.log(`Code Fee: ${fee.codeFee} nanotons (${Number(fee.codeFee) / 1_000_000_000} TON)`)
  console.log(`Data Fee: ${fee.dataFee} nanotons (${Number(fee.dataFee) / 1_000_000_000} TON)`)
  console.log(`Total Fee: ${fee.totalFee} nanotons (${Number(fee.totalFee) / 1_000_000_000} TON)`)
  console.log('-------------------------')
})
