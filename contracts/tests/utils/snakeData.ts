// Byte payload of the given size, for `SnakedCell<byte>` message data fields
// (e.g. `Router_CCIPSend.data`, `Any2TVMRampMessage.data`). The generated bindings
// snake-encode the array, so tests pass plain bytes instead of building cells.
export function testSnakeData(size: number, fill = 0xff): bigint[] {
  return Array.from(Buffer.alloc(size, fill), BigInt)
}

// Convert a hex string to snake-encoded bigint array (for `SnakedCell<byte>` message data fields)
export function snakeData(data: string): bigint[] {
  return Array.from(Buffer.from(data.replace(/^0x/i, ''), 'hex'), BigInt)
}
