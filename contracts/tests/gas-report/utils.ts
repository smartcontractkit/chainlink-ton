import { type SnapshotMetric, type SendMessageResult } from '@ton/sandbox'
import { Address } from '@ton/core'

// TON gas constants from testnet config #21
// gas_price: 26214400 / 2^16 = 400 nanotons per gas unit
const GAS_PRICE = 400n

interface TransactionSummary {
  from: string
  to: string
  contract: string
  method: string
  opCode: string
  gasUsed: number
  computeFee: bigint
  forwardFee: bigint
  actionFee: bigint
  totalFee: bigint
  totalFeeTON: string
}

interface FlowSummary {
  label: string
  transactions: TransactionSummary[]
  totalGasUsed: number
  totalFee: bigint
  totalFeeTON: string
}

function nanoToTON(nano: bigint): string {
  const ton = Number(nano) / 1_000_000_000
  return ton.toFixed(9)
}

export function analyzeSnapshot(
  snapshot: SnapshotMetric,
  addressMap?: Record<string, string>,
  txResult?: SendMessageResult,
): FlowSummary {
  const transactions: TransactionSummary[] = []

  // Assume metrics are in the same order as transactions
  let txIndex = 0
  const internalTxs = txResult
    ? txResult.transactions.filter(
        (t) => t.inMessage?.info.type === 'internal' && t.inMessage.info.dest instanceof Address,
      )
    : []

  for (let i = 0; i < snapshot.items.length; i++) {
    const metric = snapshot.items[i]
    const gasUsed = metric.execute?.compute?.gasUsed || 0
    const totalActionFees = BigInt(metric.execute?.action?.totalActionFees || 0)
    const totalFwdFees = BigInt(metric.execute?.action?.totalFwdFees || 0)

    const computeFee = BigInt(gasUsed) * GAS_PRICE
    const forwardFee = totalFwdFees
    const actionFee = totalActionFees
    const totalFee = computeFee + forwardFee + actionFee

    // Try to map address to contract name using provided map
    const toAddress = metric.address
    let contractName = metric.contractName || 'Unknown'
    if (addressMap && toAddress) {
      contractName = addressMap[toAddress] || contractName
    }

    // Find matching transaction by destination address
    let fromName = 'External'
    for (let j = txIndex; j < internalTxs.length; j++) {
      const tx = internalTxs[j]
      if (
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.dest instanceof Address &&
        tx.inMessage.info.dest.toString() === toAddress
      ) {
        if (tx.inMessage.info.src instanceof Address) {
          const fromAddress = tx.inMessage.info.src.toString()
          fromName = addressMap?.[fromAddress] || fromAddress
        }
        txIndex = j + 1 // Move to next transaction for next metric
        break
      }
    }

    transactions.push({
      from: fromName,
      to: contractName,
      contract: contractName,
      method: metric.methodName || metric.opCode,
      opCode: metric.opCode,
      gasUsed,
      computeFee,
      forwardFee,
      actionFee,
      totalFee,
      totalFeeTON: nanoToTON(totalFee),
    })
  }

  const totalGasUsed = transactions.reduce((sum, tx) => sum + tx.gasUsed, 0)
  const totalFee = transactions.reduce((sum, tx) => sum + tx.totalFee, 0n)

  return {
    label: snapshot.label,
    transactions,
    totalGasUsed,
    totalFee,
    totalFeeTON: nanoToTON(totalFee),
  }
}

// Table formatting helpers
export function formatRow(cells: string[], widths: number[]): string {
  return cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ')
}

export function printFlowAnalysis(flow: FlowSummary): void {
  console.log(`\n=== ${flow.label.toUpperCase()} ===\n`)

  // 1. Print simple flow table (from → to)
  console.log('Transaction Flow:')
  flow.transactions.forEach((tx, idx) => {
    console.log(
      `  ${idx + 1}. ${tx.from} → ${tx.to} | Gas: ${tx.gasUsed} | Fees: ${tx.totalFee.toLocaleString()} nanotons (${tx.totalFeeTON} TON)`,
    )
  })

  // 2. Print detailed table
  console.log('\nDetailed Breakdown:')
  const COL_WIDTHS = [4, 15, 20, 10, 15, 15, 15, 15]
  const headers = [
    '#',
    'Contract',
    'Method',
    'Gas',
    'Compute (TON)',
    'Forward (TON)',
    'Action (TON)',
    'Total (TON)',
  ]
  console.log(formatRow(headers, COL_WIDTHS))

  flow.transactions.forEach((tx, idx) => {
    const cells = [
      (idx + 1).toString(),
      tx.contract,
      tx.method,
      tx.gasUsed.toLocaleString().padStart(10),
      nanoToTON(tx.computeFee).padStart(15),
      nanoToTON(tx.forwardFee).padStart(15),
      nanoToTON(tx.actionFee).padStart(15),
      tx.totalFeeTON.padStart(15),
    ]
    console.log(formatRow(cells, COL_WIDTHS))
  })

  // 3. Print summary
  console.log('\n=== FLOW SUMMARY ===\n')

  const summaryItems = [
    ['Total Transactions', flow.transactions.length.toString()],
    ['Total Gas Used', `${flow.totalGasUsed.toLocaleString()} units`],
    [
      'Total Compute Fee',
      `${nanoToTON(flow.transactions.reduce((sum, tx) => sum + tx.computeFee, 0n))} TON`,
    ],
    [
      'Total Forward Fee',
      `${nanoToTON(flow.transactions.reduce((sum, tx) => sum + tx.forwardFee, 0n))} TON`,
    ],
    [
      'Total Action Fee',
      `${nanoToTON(flow.transactions.reduce((sum, tx) => sum + tx.actionFee, 0n))} TON`,
    ],
    ['Total Fee', `${flow.totalFeeTON} TON (${flow.totalFee.toLocaleString()} nanotons)`],
  ]

  summaryItems.forEach(([label, value]) => {
    console.log(`${label.padEnd(25)}: ${value}`)
  })
}
