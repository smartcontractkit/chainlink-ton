import { Address, beginCell, Builder, Cell } from '@ton/core'

export const ZERO_ADDRESS: Address = Address.parse('0:0000000000000000000000000000000000000000000000000000000000000000');

export function asSnakeData<T>(array: T[], builderFn: (item: T) => Builder): Cell {
  const cells: Builder[] = []
  let builder = beginCell()

  for (const value of array) {
    let itemBuilder = builderFn(value)
    if (itemBuilder.refs > 3) {
      throw 'Cannot pack more than 3 refs per item, use storeRef to a cell containing the item'
    }
    if (builder.availableBits < itemBuilder.bits || builder.availableRefs <= 1) {
      cells.push(builder)
      builder = beginCell()
    }
    builder.storeBuilder(itemBuilder)
  }
  cells.push(builder)

  // Build the linked structure from the end
  let current = cells[cells.length - 1].endCell()
  for (let i = cells.length - 2; i >= 0; i--) {
    const b = cells[i]
    b.storeRef(current)
    current = b.endCell()
  }
  return current
}
