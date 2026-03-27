package explorer

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

type toncenterTxResult struct {
	Account  string `json:"account"`
	LT       string `json:"lt"`
	BlockRef struct {
		Workchain int32  `json:"workchain"`
		Shard     string `json:"shard"`
		SeqNo     uint32 `json:"seqno"`
	} `json:"block_ref"`
}

type toncenterAPIResponse struct {
	Transactions []toncenterTxResult `json:"transactions"`
}

type toncenterTraceResponse struct {
	Traces []struct {
		Trace struct {
			TxHash string `json:"tx_hash"`
		} `json:"trace"`
		TransactionsOrder []string `json:"transactions_order"`
	} `json:"traces"`
}

func (c *client) supportsToncenter() bool {
	return c.net == "mainnet" || c.net == "testnet"
}

func decodeTxHash(txHash string) ([]byte, error) {
	if after, ok := strings.CutPrefix(txHash, "0x"); ok {
		txHash = after
	}

	if raw, err := hex.DecodeString(txHash); err == nil {
		return raw, nil
	}
	if raw, err := base64.StdEncoding.DecodeString(txHash); err == nil {
		return raw, nil
	}
	if raw, err := base64.URLEncoding.DecodeString(txHash); err == nil {
		return raw, nil
	}
	if raw, err := base64.RawURLEncoding.DecodeString(txHash); err == nil {
		return raw, nil
	}

	return nil, fmt.Errorf("unsupported tx hash format: %s", txHash)
}

func parseShardID(shardHex string) (int64, error) {
	if after, ok := strings.CutPrefix(shardHex, "0x"); ok {
		shardHex = after
	}

	parsed := new(big.Int)
	if _, ok := parsed.SetString(shardHex, 16); !ok {
		return 0, fmt.Errorf("invalid shard id: %s", shardHex)
	}

	if parsed.Sign() < 0 {
		if !parsed.IsInt64() {
			return 0, fmt.Errorf("shard id out of int64 range: %s", shardHex)
		}
		return parsed.Int64(), nil
	}

	if parsed.BitLen() > 64 {
		return 0, fmt.Errorf("shard id out of 64-bit range: %s", shardHex)
	}

	if parsed.Bit(63) == 1 {
		twoTo64 := new(big.Int).Lsh(big.NewInt(1), 64)
		parsed.Sub(parsed, twoTo64)
	}

	if !parsed.IsInt64() {
		return 0, fmt.Errorf("shard id out of int64 range: %s", shardHex)
	}

	return parsed.Int64(), nil
}

func (c *client) getTraceRootTxHash(ctx context.Context, txHashStr string) (string, error) {
	u, err := c.tonCenterTraceURL()
	if err != nil {
		return "", err
	}

	q := u.Query()
	q.Set("tx_hash", txHashStr)
	u.RawQuery = q.Encode()

	httpClient := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", fmt.Errorf("failed to create trace request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch trace from toncenter: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status code from trace endpoint: %d", resp.StatusCode)
	}

	var traceResp toncenterTraceResponse
	if err = json.NewDecoder(resp.Body).Decode(&traceResp); err != nil {
		return "", fmt.Errorf("failed to decode trace response: %w", err)
	}

	if len(traceResp.Traces) == 0 {
		return "", errors.New("no trace found for transaction")
	}

	trace := traceResp.Traces[0]
	if len(trace.TransactionsOrder) > 0 && trace.TransactionsOrder[0] != "" {
		return trace.TransactionsOrder[0], nil
	}
	if trace.Trace.TxHash != "" {
		return trace.Trace.TxHash, nil
	}

	return "", errors.New("trace root hash missing in trace response")
}

func (c *client) GetSenderAddressFromTxHash(ctx context.Context, txHashStr string) (*address.Address, error) {
	res, err := c.getToncenterTxByHash(ctx, txHashStr)
	if err != nil {
		return nil, err
	}

	addr, err := address.ParseRawAddr(res.Account)
	if err != nil {
		return nil, fmt.Errorf("failed to parse source address from toncenter response: %w", err)
	}
	return addr, nil
}

func (c *client) getToncenterTxByHash(ctx context.Context, txHashStr string) (*toncenterTxResult, error) {
	u, err := c.tonCenterTransactionsURL()
	if err != nil {
		return nil, err
	}

	q := u.Query()
	q.Set("hash", txHashStr)
	u.RawQuery = q.Encode()

	httpClient := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch transaction info from toncenter: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code from toncenter: %d", resp.StatusCode)
	}

	var respData toncenterAPIResponse
	if err = json.NewDecoder(resp.Body).Decode(&respData); err != nil {
		return nil, fmt.Errorf("failed to decode toncenter response: %w", err)
	}
	if len(respData.Transactions) != 1 {
		return nil, errors.New("transaction not found in toncenter response")
	}

	return &respData.Transactions[0], nil
}

func (c *client) findTxByToncenterMetadata(ctx context.Context, api ton.APIClientWrapped, txHashStr string, txHash []byte, srcAddr *address.Address) (*tlb.Transaction, error) {
	res, err := c.getToncenterTxByHash(ctx, txHashStr)
	if err != nil {
		return nil, err
	}

	lt, err := strconv.ParseUint(res.LT, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("failed to parse lt from toncenter response: %w", err)
	}

	shard, err := parseShardID(res.BlockRef.Shard)
	if err != nil {
		return nil, fmt.Errorf("failed to parse shard from toncenter response: %w", err)
	}

	block, err := api.LookupBlock(ctx, res.BlockRef.Workchain, shard, res.BlockRef.SeqNo)
	if err != nil {
		return nil, fmt.Errorf("failed to lookup block from toncenter metadata: %w", err)
	}

	tx, err := api.GetTransaction(ctx, block, srcAddr, lt)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch transaction from toncenter metadata: %w", err)
	}

	if !equalHash(tx.Hash, txHash) {
		return nil, errors.New("toncenter metadata lookup returned a different transaction hash")
	}

	return tx, nil
}

func (c *client) findTx(ctx context.Context, api ton.APIClientWrapped, srcAddr *address.Address, txHashStr string, txHash []byte) (*tlb.Transaction, error) {
	block, err := api.GetMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("get masterchain info: %w", err)
	}
	account, err := api.GetAccount(ctx, block, srcAddr)
	if err != nil {
		return nil, fmt.Errorf("get account: %w", err)
	}

	maxLT := account.LastTxLT
	maxHash := account.LastTxHash
	for range c.maxPages {
		txs, listErr := api.ListTransactions(ctx, srcAddr, c.pageSize, maxLT, maxHash)
		if listErr != nil {
			return nil, fmt.Errorf("get transaction: %w", listErr)
		}
		if len(txs) == 0 {
			return nil, errors.New("transaction not found in searched range. Try increasing --page-size and --max-pages")
		}
		for _, tx := range txs {
			if equalHash(tx.Hash, txHash) {
				return tx, nil
			}
		}

		last := txs[len(txs)-1]
		maxLT = last.PrevTxLT
		maxHash = last.PrevTxHash
	}

	if !c.supportsToncenter() {
		return nil, errors.New("transaction not found in searched range and toncenter fallback is unavailable for this network")
	}

	fallbackTx, fallbackErr := c.findTxByToncenterMetadata(ctx, api, txHashStr, txHash, srcAddr)
	if fallbackErr == nil {
		return fallbackTx, nil
	}
	return nil, fmt.Errorf("transaction not found in searched range. Try increasing --page-size and --max-pages (fallback failed: %w)", fallbackErr)
}

func equalHash(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func (c *client) tonCenterTraceURL() (*url.URL, error) {
	return c.tonCenterURL("traces")
}

func (c *client) tonCenterTransactionsURL() (*url.URL, error) {
	return c.tonCenterURL("transactions")
}

func (c *client) tonCenterURL(path string) (*url.URL, error) {
	var baseURL string
	switch c.net {
	case "mainnet":
		baseURL = "https://toncenter.com/api/v3/"
	case "testnet":
		baseURL = "https://testnet.toncenter.com/api/v3/"
	default:
		return nil, fmt.Errorf("unsupported network for toncenter lookup: %s", c.net)
	}

	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid base URL: %w", err)
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/" + path
	return u, nil
}
