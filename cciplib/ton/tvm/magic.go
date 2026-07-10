package tvm

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/xssnick/tonutils-go/tlb"
)

func ExtractMagicFromValue(v any) (uint64, error) {
	// reflect to get the magic number from the struct
	return ExtractMagic(reflect.TypeOf(v))
}

func ExtractMagic(rt reflect.Type) (uint64, error) {
	if rt.Kind() != reflect.Struct {
		return 0, fmt.Errorf("type %s is not a struct", rt.Name())
	}

	if rt.NumField() == 0 {
		return 0, fmt.Errorf("type %s has no fields", rt.Name())
	}

	if rt.Field(0).Type != reflect.TypeFor[tlb.Magic]() {
		return 0, fmt.Errorf("first field of %s is not of type Magic", rt.Name())
	}

	magicTag := rt.Field(0).Tag.Get("tlb")
	magic, err := LoadMagic(magicTag)
	if err != nil {
		return 0, fmt.Errorf("failed to load magic from tag %s: %w", magicTag, err)
	}
	return magic, nil
}

func MustExtractMagic(rt reflect.Type) uint64 {
	magic, err := ExtractMagic(rt)
	if err != nil {
		panic(fmt.Sprintf("failed to extract magic from type %s: %v", rt.Name(), err))
	}
	return magic
}

// Notice: vendoring github:xssnick/tonutils-go tlb package
func LoadMagic(tag string) (uint64, error) {
	tag = strings.TrimSpace(tag)
	var sz, base int
	if strings.HasPrefix(tag, "#") { //nolint:gocritic // vendored from tonutils-go
		base = 16
		sz = (len(tag) - 1) * 4
	} else if strings.HasPrefix(tag, "$") {
		base = 2
		sz = len(tag) - 1
	} else {
		return 0, fmt.Errorf("unknown magic value type in tag: %s", tag)
	}

	if sz > 64 {
		return 0, fmt.Errorf("too big magic value type in tag") //nolint:perfsprint // vendored from tonutils-go
	}

	magic, err := strconv.ParseUint(tag[1:], base, 64)
	if err != nil {
		return 0, fmt.Errorf("corrupted magic value in tag") //nolint:perfsprint // vendored from tonutils-go
	}

	return magic, nil
}
