package tvm

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

// ResultDecoder defines the interface for types that can
// decode execution results into a specific type T.
type ResultDecoder[T any] interface {
	Decode(*ton.ExecutionResult) (T, error)
}

// NewResultDecoder creates a new ResultDecoder[T] using the provided decode function.
func NewResultDecoder[T any](decodeFn func(*ton.ExecutionResult) (T, error)) ResultDecoder[T] {
	return &resultDecoder[T]{decode: decodeFn}
}

type resultDecoder[T any] struct {
	decode func(*ton.ExecutionResult) (T, error)
}

func (d *resultDecoder[T]) Decode(r *ton.ExecutionResult) (T, error) {
	return d.decode(r)
}

// ArgsEncoder defines the interface for types that can
// encode arguments of type A into a slice of any values.
type ArgsEncoder[A any] interface {
	Encode(A) ([]any, error)
}

// NewArgsEncoder creates a new ArgsEncoder[A] using the provided encode function.
func NewArgsEncoder[A any](encodeFn func(A) ([]any, error)) ArgsEncoder[A] {
	return &argsEncoder[A]{encode: encodeFn}
}

type argsEncoder[A any] struct {
	encode func(A) ([]any, error)
}

func (e *argsEncoder[A]) Encode(args A) ([]any, error) {
	return e.encode(args)
}

// Getter represents a getter method for a contract binding.
//
// It includes the method name, an optional encoder for input arguments of type A,
// and a decoder for output results of type R.
type Getter[A any, R any] struct {
	Name    string
	Encoder ArgsEncoder[A]   // encodesr for input arguments of type A
	Decoder ResultDecoder[R] // decoder for output results of type R
}

// GetterNoArgs represents a getter method for a contract binding that takes no arguments.
//
// It includes the method name and a decoder for output results of type R.
type GetterNoArgs[R any] struct {
	Name    string
	Decoder ResultDecoder[R] // decoder for output results of type R
}

// ResultUnmarshaler defines the interface for types that can unmarshal execution results from TON client RPC calls.
//
// Deprecated: Use ResultDecoder[T] and Getter[T] instead.
type ResultUnmarshaler interface {
	UnmarshalResult(*ton.ExecutionResult) error
}

// MethodGetter provides the getter method name for a contract binding type.
//
// Deprecated: Use Getter[T] instead.
type MethodGetter interface {
	GetterMethodName() string
}

// ResultGetter combines the ability to unmarshal results with knowledge of which getter to call.
// Types implementing this interface can be used with FetchResult for a simplified API.
//
// Deprecated: Use Getter[T] instead.
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
