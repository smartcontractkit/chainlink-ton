import { type BlockchainTransaction } from '@ton/sandbox'

export function calculateTotalFees(txs: BlockchainTransaction[]): bigint {
  return txs.reduce((sum, tx) => sum + tx.totalFees.coins, 0n)
}

export function nanoToTON(nano: bigint): string {
  const ton = Number(nano) / 1_000_000_000
  return ton.toFixed(9)
}

export function printFlowSummary(txs: BlockchainTransaction[]): void {
  const totalFees = calculateTotalFees(txs)
  const totalTransactions = txs.length

  console.log(`Total Transactions: ${totalTransactions}`)
  console.log(`Total Fees: ${nanoToTON(totalFees)} TON (${totalFees.toLocaleString()} nanotons)`)
}
