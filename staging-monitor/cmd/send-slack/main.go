package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/smartcontractkit/chainlink-ton/staging-monitor/lib"
)

func main() {
	// optional, defaults to "result.json"
	resultFile := flag.String("result-file", "result.json", "Path to read test result JSON from")
	webhookURL := flag.String("webhook-url", "", "Slack webhook URL (required)")
	flag.Parse()

	if *webhookURL == "" {
		fmt.Fprintln(os.Stderr, "Error: -webhook-url is required")
		flag.Usage()
		os.Exit(1)
	}

	exitCode := 0
	func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := sendSlackNoti(ctx, *resultFile, *webhookURL); err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			exitCode = 1
		}
	}()

	if exitCode == 0 {
		fmt.Println("Slack notification sent successfully")
	}
	os.Exit(exitCode)
}

func sendSlackNoti(ctx context.Context, resultFile, webhookURL string) error {
	// get GitHub Actions context from environment
	runURL := os.Getenv("RUN_URL")
	trigger := os.Getenv("TRIGGER")
	when := os.Getenv("WHEN")

	resultPath := lib.GetResultFilePath(resultFile)

	// validate webhook URL
	parsedURL, err := url.Parse(webhookURL)
	if err != nil || !strings.HasPrefix(parsedURL.Host, "hooks.slack.com") {
		return errors.New("Invalid Slack webhook URL")
	}

	res, err := os.ReadFile(resultPath)
	if err != nil {
		return fmt.Errorf("Failed to read %s: %w", resultPath, err)
	}

	var result lib.TestResult
	if err := json.Unmarshal(res, &result); err != nil {
		return fmt.Errorf("Failed to parse result: %w", err)
	}

	statusIcon := ":white_check_mark: Success"
	if result.Status != "success" {
		statusIcon = ":x: Failure"
	}

	payload := map[string]interface{}{
		"status":         statusIcon,
		"test_case":      result.Case,
		"src_router":     result.Router,
		"dest_receiver":  result.Receiver,
		"data":           result.Data,
		"message_id":     lib.StringOrDefault(result.MessageID, "N/A"),
		"sender_address": lib.StringOrDefault(result.SenderAddress, "N/A"),
		"sender_balance": lib.StringOrDefault(result.SenderBalance, "N/A"),
		"latency":        lib.StringOrDefault(result.LatencyFormatted, "N/A"),
		"run_url":        runURL,
		"trigger":        trigger,
		"when":           when,
		"error":          result.Error,
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("Failed to marshal payload: %w", err)
	}

	// send webhook
	if err := sendSlackWebhook(ctx, webhookURL, jsonPayload); err != nil {
		return fmt.Errorf("Failed to send Slack notification: %w", err)
	}

	return nil
}

// sendSlackWebhook sends a POST request to the Slack webhook URL with the given payload
func sendSlackWebhook(ctx context.Context, webhookURL string, payload []byte) error {
	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}
