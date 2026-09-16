import { Dictionary, DictionaryKeyTypes, DictionaryKey, DictionaryValue } from '@ton/core'
import { Codec } from './codec'

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

export const Values = {
  // Returns an DictionaryValue<[]> key (serialized as bool), used for map<K, ()>
  // where value is an empty tesnor (not important, only presence of key matters)
  EmptyTensor: (): DictionaryValue<[]> => {
    return Dictionary.Values.Bool() as unknown as DictionaryValue<[]>
  },
  FromCodec: <T>(codec: Codec<T>): DictionaryValue<T> => {
    return {
      serialize: (src, builder) => {
        codec.store(src, builder)
      },
      parse: (src): T => {
        return codec.fromSlice(src)
      },
    }
  },
}
