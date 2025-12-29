# Validate Struct Opcodes

This tool validates that struct opcodes in `.tolk` files match the CRC32 checksum of their struct names.

## Usage

```bash
go run main.go [--fix|-f] <file pattern> [<file pattern> ...]
```

### Options

- `--fix`, `-f`: Automatically fix incorrect opcodes by updating them to match the CRC32 of struct names

## Examples

```bash
# Validate all contracts
go run main.go ../../contracts/contracts

# Validate a specific file
go run main.go ../../contracts/contracts/test/examples/ocr3_base.tolk

# Automatically fix all incorrect opcodes
go run main.go --fix|-f ../../contracts/contracts
```

## How It Works

The tool:

1. Recursively finds all `.tolk` files in the specified directory
2. Parses structs with opcodes using the pattern: `struct (0xHEXVALUE) StructName`
3. Calculates the CRC32 checksum of each struct name
4. Validates that the opcode matches the expected CRC32 value
5. Reports any mismatches

## Skipping Validation

To skip validation for a specific struct (e.g., for backwards compatibility or intentional custom opcodes), add a comment before the struct definition:

```tolk
// validate-struct-opcodes:skip
struct (0x00000002) Transmit {
    ocrPluginType: uint16,
    reportContext: ReportContext,
    report: cell,
    signatures: cell,
}
```

The skip comment can be placed on the line immediately before the struct definition.

## Exit Codes

- `0`: All validations passed
- `1`: Validation errors found or execution error
