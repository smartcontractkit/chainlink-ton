package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/chain"
)

// TON Testnet liteserver configuration
// These are official TON testnet liteservers
var testnetLiteservers = []string{
	"liteserver://sU7QavX2F964iI9oToP9gffQpCQIoOLppeqL/pdPvpM=@822907680:27842",
}

type Config struct {
	ContractAddress string
	LiteserverURL   string
}

// GitHub API structures
type GitHubRelease struct {
	TagName         string    `json:"tag_name"`
	Name            string    `json:"name"`
	PublishedAt     time.Time `json:"published_at"`
	HtmlURL         string    `json:"html_url"`
	TargetCommitish string    `json:"target_commitish"`
	Assets          []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// Compiled contract JSON structure
type CompiledContract struct {
	Hash       string `json:"hash"`
	HashBase64 string `json:"hashBase64"`
	Hex        string `json:"hex"`
}

// GitHub Commit API structure
type GitHubCommit struct {
	SHA    string `json:"sha"`
	Commit struct {
		Message string `json:"message"`
	} `json:"commit"`
}

type ReleaseMatch struct {
	Release       GitHubRelease
	ContractName  string
	CodeHash      string
	CommitMessage string
}

func main() {
	config, err := parseFlags()
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()

	// Connect to TON testnet
	client, err := connectToTestnet(ctx, config.LiteserverURL)
	if err != nil {
		log.Fatalf("Failed to connect to TON testnet: %v", err)
	}

	// Parse contract address
	contractAddr, err := address.ParseAddr(config.ContractAddress)
	if err != nil {
		log.Fatalf("Failed to parse contract address %s: %v", config.ContractAddress, err)
	}

	// Execute getter method
	contractCodeHash, err := getCodeHash(ctx, client, contractAddr)
	if err != nil {
		log.Fatalf("Failed to execute getter: %v", err)
	}

	// Print result
	fmt.Printf("Contract Address: %s\n", config.ContractAddress)
	fmt.Printf("Code Hash: %s\n", contractCodeHash)

	fmt.Println("\nSearching for matching release...")
	match, err := findMatchingRelease(ctx, contractCodeHash)
	if err != nil {
		log.Fatalf("Failed to find matching release: %v", err)
	}

	if match != nil {
		fmt.Printf("\n✅ Match found!\n")
		fmt.Printf("Contract: %s\n", match.ContractName)
		fmt.Printf("Release: %s (%s)\n", match.Release.Name, match.Release.TagName)
		fmt.Printf("Published: %s\n", match.Release.PublishedAt.Format("2006-01-02 15:04:05 MST"))
		fmt.Printf("Code Hash: %s\n", match.CodeHash)
		fmt.Printf("- See release at: %s\n", match.Release.HtmlURL)
		fmt.Printf("- See commit: https://github.com/smartcontractkit/chainlink-ton/commit/%s\n", match.Release.TargetCommitish)
		if match.CommitMessage != "" {
			fmt.Printf("=== Commit message ===\n%s\n=== ============== ===\n", match.CommitMessage)
		}
	} else {
		fmt.Printf("\n❌ No matching release found\n")
	}
}

func parseFlags() (*Config, error) {
	var (
		contractAddress = flag.String("address", "", "Contract address (required)")
		liteserverURL   = flag.String("liteserver", "", "Custom liteserver URL (optional, uses default testnet servers)")
	)
	flag.Parse()

	if *contractAddress == "" {
		return nil, fmt.Errorf("contract address is required (use -address flag)")
	}

	config := &Config{
		ContractAddress: *contractAddress,
		LiteserverURL:   *liteserverURL,
	}

	return config, nil
}

func connectToTestnet(ctx context.Context, customLiteserver string) (*ton.APIClient, error) {
	pool := liteclient.NewConnectionPool()

	if customLiteserver != "" {
		// Use custom liteserver
		connectionPool, err := chain.CreateLiteserverConnectionPool(ctx, customLiteserver)
		if err != nil {
			return nil, fmt.Errorf("failed to create connection pool with custom liteserver: %w", err)
		}
		pool = connectionPool
	} else {
		// Use default testnet liteservers
		for i, liteserverURL := range testnetLiteservers {
			connectionPool, err := chain.CreateLiteserverConnectionPool(ctx, liteserverURL)
			if err != nil {
				log.Printf("Warning: failed to connect to liteserver %d (%s): %v", i+1, liteserverURL, err)
				continue
			}
			pool = connectionPool
			break
		}
	}

	client := ton.NewAPIClient(pool, ton.ProofCheckPolicyFast)

	// Test connection
	_, err := client.GetMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get masterchain info: %w", err)
	}

	fmt.Println("Successfully connected to TON testnet")
	return client, nil
}

func getCodeHash(ctx context.Context, client *ton.APIClient, contractAddr *address.Address) (string, error) {
	// Get current masterchain info for block reference
	block, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	// Execute getter method
	result, err := client.WaitForBlock(block.SeqNo).RunGetMethod(ctx, block, contractAddr, "codeHash")
	if err != nil {
		return "", fmt.Errorf("failed to run get method: %w", err)
	}

	// sha256 of the code cell
	codeHashBigInt, err := result.Int(0)
	if err != nil {
		return "", fmt.Errorf("failed to extract code hash: %w", err)
	}
	codeHashBytes := codeHashBigInt.Bytes()
	codeHashToHex := fmt.Sprintf("0x%x", codeHashBytes)
	// Format result
	return codeHashToHex, nil
}

func findMatchingRelease(ctx context.Context, targetCodeHash string) (*ReleaseMatch, error) {
	releases, err := fetchGitHubReleases(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch GitHub releases: %w", err)
	}

	fmt.Printf("Found %d releases to check\n", len(releases))

	// Track lines printed for clearing later
	linesPrinted := 1 // "Found X releases to check" line

	for i, release := range releases {
		fmt.Printf("Checking release %d/%d: %s (%s) - Published: %s\n", i+1, len(releases), release.Name, release.TagName, release.PublishedAt.Format("2006-01-02"))
		linesPrinted++

		match, err := checkReleaseForMatch(ctx, release, targetCodeHash)
		if err != nil {
			log.Printf("Warning: failed to check release %s: %v", release.TagName, err)
			linesPrinted++
			continue
		}

		if match != nil {
			// Clear all the checking lines
			clearLines(linesPrinted)
			return match, nil
		}
	}

	// Clear all the checking lines even if no match found
	clearLines(linesPrinted)
	return nil, nil
}

// clearLines moves the cursor up and clears the specified number of lines
func clearLines(lines int) {
	for i := 0; i < lines; i++ {
		fmt.Print("\033[1A") // Move cursor up one line
		fmt.Print("\033[2K") // Clear the entire line
	}
}

func fetchGitHubReleases(ctx context.Context) ([]GitHubRelease, error) {
	url := "https://api.github.com/repos/smartcontractkit/chainlink-ton/releases"

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "ton-getter/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch releases: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var releases []GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, fmt.Errorf("failed to decode releases: %w", err)
	}

	return releases, nil
}

func checkReleaseForMatch(ctx context.Context, release GitHubRelease, targetCodeHash string) (*ReleaseMatch, error) {
	// Find the tar.gz asset
	var tarAssetURL string
	for _, asset := range release.Assets {
		if strings.HasSuffix(asset.Name, ".tar.gz") {
			tarAssetURL = asset.BrowserDownloadURL
			break
		}
	}

	if tarAssetURL == "" {
		return nil, fmt.Errorf("no tar.gz asset found in release %s", release.TagName)
	}

	// Create temporary directory
	tempDir, err := os.MkdirTemp("", "ton-contracts-"+release.TagName+"-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(tempDir)

	// Download and extract the archive
	if err := downloadAndExtract(ctx, tarAssetURL, tempDir); err != nil {
		return nil, fmt.Errorf("failed to download and extract archive: %w", err)
	}

	// Find all .compiled.json files
	contractFiles, err := findContractFiles(tempDir)
	if err != nil {
		return nil, fmt.Errorf("failed to find contract files: %w", err)
	}

	// Check each contract file
	for _, contractPath := range contractFiles {
		// Read and parse the compiled contract JSON directly
		jsonData, err := os.ReadFile(contractPath)
		if err != nil {
			log.Printf("Warning: failed to read contract file %s: %v", contractPath, err)
			continue
		}

		var compiledContract CompiledContract
		if err := json.Unmarshal(jsonData, &compiledContract); err != nil {
			log.Printf("Warning: failed to parse contract JSON %s: %v", contractPath, err)
			continue
		}

		// Use the hash directly from the JSON, add 0x prefix if not present
		contractHashHex := compiledContract.Hash
		if !strings.HasPrefix(contractHashHex, "0x") {
			contractHashHex = "0x" + contractHashHex
		}

		if contractHashHex == targetCodeHash {
			contractName := filepath.Base(contractPath)
			contractName = strings.TrimSuffix(contractName, ".compiled.json")

			// Fetch commit message
			commitMessage, err := fetchCommitMessage(ctx, release.TargetCommitish)
			if err != nil {
				log.Printf("Warning: failed to fetch commit message for %s: %v", release.TargetCommitish, err)
			}

			return &ReleaseMatch{
				Release:       release,
				ContractName:  contractName,
				CodeHash:      contractHashHex,
				CommitMessage: commitMessage,
			}, nil
		}
	}

	return nil, nil
}

func downloadAndExtract(ctx context.Context, url, destDir string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create download request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to download archive: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	// Create gzip reader
	gzipReader, err := gzip.NewReader(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer gzipReader.Close()

	// Create tar reader
	tarReader := tar.NewReader(gzipReader)

	// Extract files
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to read tar entry: %w", err)
		}

		// Only extract .compiled.json files
		if !strings.HasSuffix(header.Name, ".compiled.json") {
			continue
		}

		// Create the destination file path
		destPath := filepath.Join(destDir, filepath.Base(header.Name))

		// Create the file
		outFile, err := os.Create(destPath)
		if err != nil {
			return fmt.Errorf("failed to create file %s: %w", destPath, err)
		}

		// Copy the file content
		_, err = io.Copy(outFile, tarReader)
		outFile.Close()
		if err != nil {
			return fmt.Errorf("failed to write file %s: %w", destPath, err)
		}
	}

	return nil
}

func findContractFiles(dir string) ([]string, error) {
	var contractFiles []string

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if strings.HasSuffix(info.Name(), ".compiled.json") {
			contractFiles = append(contractFiles, path)
		}

		return nil
	})

	return contractFiles, err
}

func fetchCommitMessage(ctx context.Context, commitSHA string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/smartcontractkit/chainlink-ton/commits/%s", commitSHA)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create commit request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "ton-getter/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch commit: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned status %d for commit %s", resp.StatusCode, commitSHA)
	}

	var commit GitHubCommit
	if err := json.NewDecoder(resp.Body).Decode(&commit); err != nil {
		return "", fmt.Errorf("failed to decode commit: %w", err)
	}

	return commit.Commit.Message, nil
}
