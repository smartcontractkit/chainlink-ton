package lib

// TestResult captures the outcome and metrics of a single test
type TestResult struct {
	Case             string `json:"case"`                     // e.g. "messaging-ton2evm"
	Status           string `json:"status"`                   // "success" or "failure"
	SenderAddress    string `json:"sender_address,omitempty"` // Wallet address that sent the message
	SenderBalance    string `json:"sender_balance,omitempty"` // Balance before send
	MessageID        string `json:"message_id,omitempty"`
	LatencySeconds   int64  `json:"latency_seconds,omitempty"`   // Send to receive time in seconds
	LatencyFormatted string `json:"latency_formatted,omitempty"` // Formatted as "MM:SS"
	Router           string `json:"router"`
	Receiver         string `json:"receiver"`
	Data             string `json:"data"`
	Error            string `json:"error,omitempty"`
}
