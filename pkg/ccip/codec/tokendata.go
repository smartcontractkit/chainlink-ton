package codec

import (
	"context"
	"errors"

	cciptypes "github.com/smartcontractkit/chainlink-ccip/pkg/types/ccipocr3"
)

type TokenDataEncoder struct{}

func NewTokenDataEncoder() TokenDataEncoder {
	return TokenDataEncoder{}
}

func (t TokenDataEncoder) EncodeUSDC(_ context.Context, message cciptypes.Bytes, attestation cciptypes.Bytes) (cciptypes.Bytes, error) {
	return nil, errors.New("not implemented")
}
