// services/converter/registry.ts

import { Converter } from './types.js'

type FormatPair = `${string}→${string}`

export class ConverterRegistry {
  private converters = new Map<FormatPair, Converter>()

  register(converter: Converter): void {
    const key: FormatPair = `${converter.inputFormat}→${converter.outputFormat}`
    this.converters.set(key, converter)
  }

  get(inputFormat: string, outputFormat: string): Converter | undefined {
    const key: FormatPair = `${inputFormat}→${outputFormat}`
    return this.converters.get(key)
  }

  getSupportedOutputs(inputFormat: string): string[] {
    const outputs: string[] = []
    for (const [key, _converter] of this.converters) {
      if (key.startsWith(`${inputFormat}→`)) {
        outputs.push(key.split('→')[1])
      }
    }
    return outputs
  }

  isSupported(inputFormat: string, outputFormat: string): boolean {
    return this.get(inputFormat, outputFormat) !== undefined
  }
}

// Global singleton
export const registry = new ConverterRegistry()
