package tvm

import "github.com/xssnick/tonutils-go/ton"

type ResultUnmarshaler interface {
	UnmarshalResult(*ton.ExecutionResult) error
}

func LoadFromResult(v ResultUnmarshaler, res *ton.ExecutionResult) error {
	return v.UnmarshalResult(res)
}
