package lib

import (
	"fmt"
	"time"
)

// FormatDuration formats a duration as MM:SS
func FormatDuration(d time.Duration) string {
	seconds := int(d.Seconds())
	minutes := seconds / 60
	secs := seconds % 60
	return fmt.Sprintf("%02d:%02d", minutes, secs)
}
