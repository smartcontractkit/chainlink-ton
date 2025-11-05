package lib

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// FormatDuration formats a duration as MM:SS
func FormatDuration(d time.Duration) string {
	seconds := int(d.Seconds())
	minutes := seconds / 60
	secs := seconds % 60
	return fmt.Sprintf("%02d:%02d", minutes, secs)
}

// GetResultFilePath returns the path for test result JSON output
// If path is empty, defaults to "result.json"
func GetResultFilePath(path string) string {
	if path != "" {
		return path
	}
	return "result.json"
}

// OutputJSON writes the test result to a JSON file
func OutputJSON(result TestResult, filePath string) {
	f, err := os.Create(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create result file: %v\n", err)
		return
	}
	defer f.Close()

	encoder := json.NewEncoder(f)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write result: %v\n", err)
	}
}

// StringOrDefault returns the value if non-empty, otherwise returns the default
func StringOrDefault(val, def string) string {
	if val == "" {
		return def
	}
	return val
}

// RedactAddress redacts an address, showing only first 6 and last 4 characters
// Examples:
//   - "EQDtF...74p4q2" -> "EQDtF...4q2"
//   - "0xabcdef123456789" -> "0xabcd...6789"
func RedactAddress(addr string) string {
	if addr == "" || addr == "N/A" {
		return addr
	}

	// For TON addresses (typically start with EQ or UQ and are ~48 chars)
	// For EVM addresses (0x followed by 40 hex chars)
	if len(addr) <= 10 {
		return addr // too short to redact meaningfully
	}

	// Show first 6 chars and last 4 chars
	prefix := addr[:6]
	suffix := addr[len(addr)-4:]
	return prefix + "..." + suffix
}
