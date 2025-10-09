package explorer

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// ParseURL extracts transaction hash and network from tonscan URL
// Supports tonscan.org URL formats
func ParseURL(urlStr string) (txHash, address, network string, err error) {
	u, err := url.Parse(urlStr)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid URL: %w", err)
	}

	// Determine network from subdomain (tonscan.org format)
	network = "mainnet" // default
	if strings.Contains(u.Host, "testnet.tonscan.org") {
		network = "testnet"
	} else if strings.Contains(u.Host, "tonscan.org") {
		network = "mainnet"
	}

	// Handle tonscan.org transaction URLs: /tx/{hash}
	if strings.Contains(u.Host, "tonscan.org") {
		pathParts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(pathParts) >= 2 && pathParts[0] == "tx" {
			txHash = pathParts[1]
			return txHash, address, network, nil
		}
	}

	return "", "", "", errors.New("unsupported URL format")
}
