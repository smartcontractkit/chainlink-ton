package tvm

import (
	"context"
	"errors"
	"fmt"
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

// Getter represents a getter method for a contract binding.
//
// It includes the method name, an optional encoder for input arguments of type A,
// and a decoder for output results of type R.
type Getter[A any, R any] struct {
	Name    string
	Encoder ArgsEncoder[A]   // encoder for input arguments of type A
	Decoder ResultDecoder[R] // decoder for output results of type R
}

// NoArgs is used to represent a getter method without input arguments.
type NoArgs struct{}

type NoArgsOpts[R any] struct {
	Name    string
	Decoder ResultDecoder[R]
}

// NewNoArgsGetter creates a new Getter[NoArgs, R] for a getter method that takes no arguments.
func NewNoArgsGetter[R any](opts NoArgsOpts[R]) Getter[NoArgs, R] {
	return Getter[NoArgs, R]{
		Name:    opts.Name,
		Encoder: DefaultArgsEncoder[NoArgs](),
		Decoder: opts.Decoder,
	}
}

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

// DefaultArgsEncoder returns an ArgsEncoder that derives the parameter slice from the
// provided value using reflection. Scalars become a single-element slice, structs are
// flattened across exported fields (respecting `tvm:"-"`), slices/arrays expand per
// element except for byte-like sequences which are passed through as-is, and pointers are
// forwarded without dereferencing (nil pointers encode as a single nil argument).
func DefaultArgsEncoder[A any]() ArgsEncoder[A] {
	return NewArgsEncoder(func(args A) ([]any, error) {
		return encodeArgsDefault(args)
	})
}

func encodeArgsDefault(input any) ([]any, error) {
	if input == nil {
		return []any{nil}, nil
	}

	value := reflect.ValueOf(input)
	if !value.IsValid() {
		return nil, errors.New("tvm: cannot encode invalid value as argument")
	}

	switch value.Kind() {
	case reflect.Interface:
		// Unwrap and encode the underlying value
		if value.IsNil() {
			return []any{nil}, nil
		}
		return encodeArgsDefault(value.Elem().Interface())
	case reflect.Pointer:
		// Pass through pointer values without expanding (e.g., *struct as a single arg)
		if value.IsNil() {
			return []any{nil}, nil
		}
		return []any{value.Interface()}, nil
	case reflect.Struct:
		// Check for NoArgs type
		if value.Type() == reflect.TypeFor[NoArgs]() {
			return []any{}, nil
		}
		// Expand exported fields, skipping those with `tvm:"-"` tag
		t := value.Type()
		params := make([]any, 0, t.NumField())
		for i := 0; i < t.NumField(); i++ {
			field := t.Field(i)
			if !field.IsExported() || field.Tag.Get("tvm") == "-" {
				continue
			}
			params = append(params, value.Field(i).Interface())
		}
		return params, nil
	case reflect.Slice, reflect.Array:
		// Check for byte-like sequences
		elemKind := value.Type().Elem().Kind()
		if elemKind == reflect.Uint8 {
			return []any{value.Interface()}, nil
		}

		// Otherwise, expand elements
		length := value.Len()
		params := make([]any, length)
		for i := range length {
			params[i] = value.Index(i).Interface()
		}
		return params, nil
	default:
		return []any{value.Interface()}, nil
	}
}

// CallGetterLatest executes the provided getter with the latest masterchain block
func CallGetterLatest[A any, R any](
	ctx context.Context,
	client ton.APIClientWrapped,
	contractAddr *address.Address,
	getter Getter[A, R],
	input ...A, // optional input arguments
) (R, error) {
	var zero R
	// Get current block
	block, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return zero, fmt.Errorf("failed to get current block: %w", err)
	}

	return CallGetter(ctx, client, block, contractAddr, getter, input...)
}

// CallGetter executes the provided getter using the supplied arguments of type A and
// decodes the result into type R. With no arguments it issues the request without
// parameters, while a single argument is encoded (using the getter's encoder when
// provided, otherwise the DefaultArgsEncoder).
func CallGetter[A any, R any](
	ctx context.Context,
	client ton.APIClientWrapped,
	block *ton.BlockIDExt,
	contractAddr *address.Address,
	getter Getter[A, R],
	input ...A, // optional input arguments
) (R, error) {
	var zero R

	if len(input) > 1 {
		return zero, fmt.Errorf("tvm: CallGetter received multiple inputs for %q", getter.Name)
	}

	if len(input) == 0 {
		result, err := client.WaitForBlock(block.SeqNo).RunGetMethod(ctx, block, contractAddr, getter.Name)
		if err != nil {
			return zero, fmt.Errorf("tvm: failed to run get method %q: %w", getter.Name, err)
		}

		if getter.Decoder == nil {
			return zero, fmt.Errorf("tvm: getter %q has no decoder", getter.Name)
		}

		return getter.Decoder.Decode(result)
	}

	var argsValue A
	if len(input) == 1 {
		argsValue = input[0]
	}

	encoder := getter.Encoder
	if encoder == nil {
		encoder = DefaultArgsEncoder[A]()
	}

	params, err := encoder.Encode(argsValue)
	if err != nil {
		return zero, fmt.Errorf("tvm: failed to encode args for getter %q: %w", getter.Name, err)
	}

	result, err := client.WaitForBlock(block.SeqNo).RunGetMethod(ctx, block, contractAddr, getter.Name, params...)
	if err != nil {
		return zero, fmt.Errorf("tvm: failed to run get method %q: %w", getter.Name, err)
	}

	if getter.Decoder == nil {
		return zero, fmt.Errorf("tvm: getter %q has no decoder", getter.Name)
	}

	return getter.Decoder.Decode(result)
}
