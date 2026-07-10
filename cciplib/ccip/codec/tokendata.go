package codec

import (
	"context"
	"errors"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
)

type TokenDataEncoder struct{}

var _ ccipocr3.TokenDataEncoder = &TokenDataEncoder{}

func NewTokenDataEncoder() TokenDataEncoder {
	return TokenDataEncoder{}
}

func (t TokenDataEncoder) EncodeUSDC(_ context.Context, message ccipocr3.Bytes, attestation ccipocr3.Bytes) (ccipocr3.Bytes, error) {
	return nil, errors.New("not implemented")
}
