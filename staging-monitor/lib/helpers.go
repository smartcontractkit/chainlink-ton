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
