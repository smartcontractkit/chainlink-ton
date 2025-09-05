import { Dictionary, DictionaryKeyTypes, DictionaryKey, DictionaryValue, Builder } from '@ton/core'

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

export type TolkUMap<K extends DictionaryKeyTypes, V> = {
  keyLen: number
  dict: Dictionary<K, V>
}

export function UMapToBuilder<K extends DictionaryKeyTypes, V>(data: TolkUMap<K, V>): Builder {
  return new Builder().storeDict(data.dict).storeUint(data.keyLen, 16)
}
