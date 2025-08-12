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
