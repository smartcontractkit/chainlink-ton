import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target:
    'contracts/test/examples/async-communication/request-reply-with-two-dependencies/item_count.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
