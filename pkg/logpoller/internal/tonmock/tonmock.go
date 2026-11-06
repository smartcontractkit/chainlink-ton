// Package tonmock provides test doubles for the tonutils-go client interfaces.
//
// It lives outside any _test.go file so that both package logpoller and its
// subpackages (e.g. package loader) can share a single implementation.
package tonmock

import (
	"context"
	"errors"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

// APIClient is a minimal ton.APIClientWrapped implementation.
//
// Only the methods exercised by the logpoller tests are implemented; the rest
// fall through to the embedded interface and panic if called.
type APIClient struct {
	ton.APIClientWrapped // embed to satisfy the interface

	MasterchainInfo *ton.BlockIDExt
	MasterchainErr  error

	LookupBlockResult *ton.BlockIDExt
	LookupBlockErr    error
	LookupBlockFunc   func(seqNo uint32) *ton.BlockIDExt // optional: dynamic block lookup

	AccountFunc func(block *ton.BlockIDExt) (*tlb.Account, error)

	LiteClient *LiteClient
}

func (m *APIClient) CurrentMasterchainInfo(_ context.Context) (*ton.BlockIDExt, error) {
	return m.MasterchainInfo, m.MasterchainErr
}

func (m *APIClient) LookupBlock(_ context.Context, _ int32, _ int64, seqNo uint32) (*ton.BlockIDExt, error) {
	if m.LookupBlockFunc != nil {
		return m.LookupBlockFunc(seqNo), m.LookupBlockErr
	}
	return m.LookupBlockResult, m.LookupBlockErr
}

func (m *APIClient) GetAccount(_ context.Context, block *ton.BlockIDExt, _ *address.Address) (*tlb.Account, error) {
	if m.AccountFunc == nil {
		return nil, errors.New("tonmock: AccountFunc is not set")
	}
	return m.AccountFunc(block)
}

func (m *APIClient) Client() ton.LiteClient {
	return m.LiteClient
}

func (m *APIClient) WaitForBlock(_ uint32) ton.APIClientWrapped {
	return m
}

// LiteClient mocks the ton.LiteClient interface, letting tests control
// QueryLiteserver responses.
type LiteClient struct {
	ton.LiteClient

	QueryFunc func(ctx context.Context, req, resp tl.Serializable) error
	CallCount int
}

func (m *LiteClient) QueryLiteserver(ctx context.Context, req tl.Serializable, resp tl.Serializable) error {
	m.CallCount++
	if m.QueryFunc != nil {
		return m.QueryFunc(ctx, req, resp)
	}
	return nil
}
