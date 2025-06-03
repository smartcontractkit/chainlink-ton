import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/multi_ocr3_base.tact',
  options: {
    debug: true,
  },
}
