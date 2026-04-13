import { Dictionary } from '@ton/core'

// Utility function for deep equality check of TON contract storage objects, with special handling for:
// - Dictionary types.
export function tonDeepEqual<T extends object>(obj: T, expected: T) {
  const actualKeys = Object.keys(obj) as (keyof T)[]
  const expectedKeys = Object.keys(expected) as (keyof T)[]

  expect(actualKeys.length).toBe(expectedKeys.length)

  for (const key of expectedKeys) {
    const expectedValue = expected[key]
    expect(actualKeys).toContain(key)
    const actualValue = obj[key]
    const type = typeof actualValue
    if (type !== typeof expectedValue) {
      throw new Error(
        `Field ${key.toString()} has different types. Actual: ${type}, Expected: ${typeof expectedValue}`,
      )
    }
    if (type === 'function') continue
    if (type !== 'object' || actualValue === null || expectedValue === null) {
      expect(actualValue).toBe(expectedValue)
      continue
    }
    if (actualValue instanceof Dictionary) {
      if (!(expectedValue instanceof Dictionary)) {
        throw new Error(`Expected field ${key.toString()} to be a Dictionary`)
      }
      expect(actualValue.size).toBe(expectedValue.size)
      for (const entry of actualValue.keys()) {
        expect(actualValue.get(entry)).toStrictEqual(expectedValue.get(entry))
      }
      continue
    }
    tonDeepEqual(actualValue as object, expectedValue as object)
  }
}
