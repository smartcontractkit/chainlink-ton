import { OCR3Config } from '../../../wrappers/libraries/ocr/MultiOCR3Base'

export function expectEqualsConfig(config1: OCR3Config, config2: OCR3Config) {
  expect(config1.configInfo).toEqual(config2.configInfo)

  expect(config1.signers).toEqual(expect.arrayContaining(config2.signers))
  expect(config1.signers).toHaveLength(config2.signers.length)

  // Compare transmitters (Address arrays)
  expect(config1.transmitters).toEqual(expect.arrayContaining(config2.transmitters))
  expect(config1.transmitters).toHaveLength(config2.transmitters.length)
}
