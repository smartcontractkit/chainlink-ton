import { Builder, beginCell, Cell } from '@ton/core'
import { asSnakeData } from '../../../../utils/Utils'

export function listAsSnake(array: bigint[]): Cell {
  return asSnakeData(array, (item) => new Builder().storeUint(item, 256))
}
