package explorer

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// ParseURL extracts transaction hash and network from tonscan URL
// Supports tonscan.org and mylocalton explorer URL formats
func ParseURL(urlStr string) (txHash, address, network string, err error) {
	u, err := url.Parse(urlStr)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid URL: %w", err)
	}

	// Determine network from subdomain (tonscan.org format)
	network = "testnet" // default
	switch {
	case strings.Contains(u.Host, "testnet.tonscan.org"):
	case strings.Contains(u.Host, "testnet.tonviewer.com"):
		network = "testnet"
	case strings.Contains(u.Host, "tonscan.org"):
	case strings.Contains(u.Host, "tonviewer.com"):
		network = "mainnet"
	case strings.Contains(u.Host, "localhost"):
		network = "mylocalton"
	}

	// Handle tonscan.org transaction URLs: /tx/{hash}
	switch {

	case strings.Contains(u.Host, "tonscan.org"):
		pathParts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(pathParts) >= 2 && pathParts[0] == "tx" {
			txHash = pathParts[1]
			return txHash, address, network, nil
		}
	case strings.Contains(u.Host, "tonviewer.com"):
		pathParts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(pathParts) >= 2 && pathParts[0] == "transaction" {
			txHash = pathParts[1]
			return txHash, address, network, nil
		}
	case strings.Contains(u.Host, "localhost"):
		// Handle mylocalton transaction URLs: /transaction?hash={hash}&account={address}
		if u.Path == "/transaction" {
			query := u.Query()
			txHash = query.Get("hash")
			address = query.Get("account")
			if txHash != "" {
				return txHash, address, network, nil
			}
		}
	}

	return "", "", "", errors.New("unsupported URL format")
}
