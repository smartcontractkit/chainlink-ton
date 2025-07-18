package hash

import (
	"hash/crc32"
	"strings"
)

// https://docs.ton.org/v3/documentation/data-formats/tlb/crc32
// ieeeTable is a pre-calculated table for the CRC32-IEEE polynomial
var ieeeTable = crc32.MakeTable(crc32.IEEE)

// CalculateSchemaCRC32 takes a schema string, cleans it, and calculates the CRC32-IEEE checksum, returning it as a uint32.
func CalcCRC32(schema string) uint32 {
	// normalize the input
	cleanedSchema := strings.ReplaceAll(schema, "(", "")
	cleanedSchema = strings.ReplaceAll(cleanedSchema, ")", "")

	// convert the cleaned string to a byte slice.
	data := []byte(cleanedSchema)

	// calculate the CRC32 checksum using the IEEE polynomial table and return it directly.
	crc := crc32.Checksum(data, ieeeTable)

	return crc
}
