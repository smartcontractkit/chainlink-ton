import { Dictionary, DictionaryKeyTypes, DictionaryKey, DictionaryValue } from '@ton/core'

export const loadMap = <K extends DictionaryKeyTypes, V>(
  key: DictionaryKey<K>,
  value: DictionaryValue<V>,
  map: Map<K, V>,
): Dictionary<K, V> => {
  const dict = Dictionary.empty(key, value)
  for (const [k, v] of map) {
    dict.set(k, v)
  }
  return dict
}

export function loadDict<K extends DictionaryKeyTypes, V>(dict: Dictionary<K, V>): Map<K, V> {
  const map: Map<K, V> = new Map()

  for (const [key, value] of dict) {
    map.set(key, value)
  }

  return map
}

// Returns an DictionaryValue<[]> key (serialized as bool), used for map<K, ()>
// where value is an empty tesnor (not important, only presence of key matters)
export function createEmptyTensorValue() {
  return Dictionary.Values.Bool() as unknown as DictionaryValue<[]>
}
