package tvm

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

type ResultUnmarshaler interface {
	UnmarshalResult(*ton.ExecutionResult) error
}

func LoadFromResult(v ResultUnmarshaler, res *ton.ExecutionResult) error {
	return v.UnmarshalResult(res)
}

// RunGetLoad fetches and unmarshal the result of a getter method for the given contract address.
func RunGetLoad(
	ctx context.Context,
	client ton.APIClientWrapped,
	block *ton.BlockIDExt,
	contractAddr *address.Address,
	methodName string,
	sourceStruct ResultUnmarshaler,
	opts []interface{},
) error {
	var result *ton.ExecutionResult
	var err error
	if opts == nil {
		result, err = client.RunGetMethod(ctx, block, contractAddr, methodName)
	} else {
		result, err = client.RunGetMethod(ctx, block, contractAddr, methodName, opts...)
	}

	if err != nil {
		return err
	}

	return LoadFromResult(sourceStruct, result)
}
