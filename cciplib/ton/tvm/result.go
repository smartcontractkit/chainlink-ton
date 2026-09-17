package tvm

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

// ResultUnmarshaler defines the interface for types that can unmarshal execution results from TON client RPC calls.
//
// Deprecated: Use ResultDecoder[T] and Getter[A, R] instead.
type ResultUnmarshaler interface {
	UnmarshalResult(*ton.ExecutionResult) error
}

// MethodGetter provides the getter method name for a contract binding type.
//
// Deprecated: Use Getter[A, R] instead.
type MethodGetter interface {
	GetterMethodName() string
}

// ResultGetter combines the ability to unmarshal results with knowledge of which getter to call.
// Types implementing this interface can be used with FetchResult for a simplified API.
//
// Deprecated: Use Getter[A, R] instead.
type ResultGetter interface {
	ResultUnmarshaler
	MethodGetter
}

// LoadFromResult unmarshals an execution result into a ResultUnmarshaler.
//
// Deprecated: Use Getter[A, R] and ResultDecoder[T] instead.
func LoadFromResult(v ResultUnmarshaler, res *ton.ExecutionResult) error {
	return v.UnmarshalResult(res)
}

// FetchResult fetches and unmarshals the result of a getter method using the ResultGetter interface.
// The getter method name is obtained from the sourceStruct itself, eliminating the need for a central registry.
//
// Deprecated: Use the new Getter[A, R] pattern instead. For example:
//
//	result, err := client.RunGetMethod(ctx, block, contractAddr, getter.Name, args...)
//	if err != nil {
//	    return err
//	}
//	value, err := getter.Decoder.Decode(result)
func FetchResult(
	ctx context.Context,
	client ton.APIClientWrapped,
	block *ton.BlockIDExt,
	contractAddr *address.Address,
	sourceStruct ResultGetter,
	opts []any,
) error {
	methodName := sourceStruct.GetterMethodName()
	var result *ton.ExecutionResult
	var err error
	waiterClient := client.WaitForBlock(block.SeqNo)
	if opts == nil {
		result, err = waiterClient.RunGetMethod(ctx, block, contractAddr, methodName)
	} else {
		result, err = waiterClient.RunGetMethod(ctx, block, contractAddr, methodName, opts...)
	}

	if err != nil {
		return err
	}

	return LoadFromResult(sourceStruct, result)
}
