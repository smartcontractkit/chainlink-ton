package tvm

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

// ResultUnmarshaler defines the interface for types that can unmarshal execution results from TON client RPC calls.
type ResultUnmarshaler interface {
	UnmarshalResult(*ton.ExecutionResult) error
}

// MethodGetter provides the getter method name for a contract binding type.
type MethodGetter interface {
	GetterMethodName() string
}

// ResultGetter combines the ability to unmarshal results with knowledge of which getter to call.
// Types implementing this interface can be used with FetchResult for a simplified API.
type ResultGetter interface {
	ResultUnmarshaler
	MethodGetter
}

func LoadFromResult(v ResultUnmarshaler, res *ton.ExecutionResult) error {
	return v.UnmarshalResult(res)
}

// FetchResult fetches and unmarshals the result of a getter method using the ResultGetter interface.
// The getter method name is obtained from the sourceStruct itself, eliminating the need for a central registry.
func FetchResult(
	ctx context.Context,
	client ton.APIClientWrapped,
	block *ton.BlockIDExt,
	contractAddr *address.Address,
	sourceStruct ResultGetter,
	opts []interface{},
) error {
	methodName := sourceStruct.GetterMethodName()
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
