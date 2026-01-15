package ton_test

import (
	"errors"
	"fmt"
	"math/big"
	"math/rand"
	"reflect"
	"strconv"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	// TODO: These imports should be removed and injected via options/factories
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

// ErrUnsupportedSample is returned when the generator cannot construct a value for a type.
var ErrUnsupportedSample = errors.New("unsupported sample generation")

const (
	defaultMaxDepth           = 6
	defaultMaxCollectionItems = 2
	defaultPointerNilProb     = 0.15
)

// TODO: replace with third-party option like github.com/go-faker/faker
// Example: https://github.com/go-faker/faker/blob/main/example_custom_struct_test.go
//
// Generator produces TL-B compliant random values for tests.
type Generator struct {
	rng                *rand.Rand
	pointerNilProb     float64
	custom             map[reflect.Type]Factory
	maxDepth           int
	maxCollectionItems int
}

// Option configures a Generator instance.
type Option func(*Generator)

// Factory creates a value for a specific reflect.Type.
type Factory func(*Context) (reflect.Value, error)

// Context provides generation metadata to factories.
type Context struct {
	Generator *Generator
	Type      reflect.Type
	Field     *reflect.StructField
	Tag       tlbTagHint
	Depth     int
}

// tlbTagHint captures parsed information from a `tlb` struct tag.
type tlbTagHint struct {
	raw         string
	bitSize     int
	hasBitSize  bool
	intBits     int
	hasIntBits  bool
	dictKeyBits int
	hasDictBits bool
	maybe       bool
}

// Raw returns the original tag string.
func (h tlbTagHint) Raw() string {
	return h.raw
}

// BitLen returns the configured bit length from a `bits` directive.
func (h tlbTagHint) BitLen() (int, bool) {
	if h.hasBitSize {
		return h.bitSize, true
	}
	return 0, false
}

// IntBitLen returns the configured bit length from a `##` directive.
func (h tlbTagHint) IntBitLen() (int, bool) {
	if h.hasIntBits {
		return h.intBits, true
	}
	return 0, false
}

// DictKeyBitLen returns the configured bit length for dictionary keys.
func (h tlbTagHint) DictKeyBitLen() (int, bool) {
	if h.hasDictBits {
		return h.dictKeyBits, true
	}
	return 0, false
}

// Maybe indicates whether the tag allows a nil pointer.
func (h tlbTagHint) Maybe() bool {
	return h.maybe
}

// ByteLen returns the tag-implied byte length if available.
func (h tlbTagHint) ByteLen() (int, bool) {
	if bits, ok := h.BitLen(); ok {
		return (bits + 7) / 8, true
	}
	if bits, ok := h.IntBitLen(); ok && bits%8 == 0 {
		return bits / 8, true
	}
	return 0, false
}

// NewGenerator constructs a Generator with sensible defaults.
func NewGenerator(opts ...Option) *Generator {
	g := &Generator{
		rng:                rand.New(rand.NewSource(42)),
		pointerNilProb:     defaultPointerNilProb,
		custom:             make(map[reflect.Type]Factory),
		maxDepth:           defaultMaxDepth,
		maxCollectionItems: defaultMaxCollectionItems,
	}

	for t, factory := range buildDefaultFactories() {
		g.custom[t] = factory
	}

	for _, opt := range opts {
		opt(g)
	}

	return g
}

// WithRand overrides the random source used by the generator.
func WithRand(r *rand.Rand) Option {
	return func(g *Generator) {
		if r != nil {
			g.rng = r
		}
	}
}

// WithPointerNilProbability configures how often optional pointers render as nil.
func WithPointerNilProbability(prob float64) Option {
	return func(g *Generator) {
		if prob < 0 {
			prob = 0
		}
		if prob > 1 {
			prob = 1
		}
		g.pointerNilProb = prob
	}
}

// WithFactories merges the provided factories into the generator.
func WithFactories(factories map[reflect.Type]Factory) Option {
	return func(g *Generator) {
		for t, factory := range factories {
			if factory == nil {
				delete(g.custom, t)
				continue
			}
			g.custom[t] = factory
		}
	}
}

// RegisterFactory registers or replaces a factory for a given type.
func (g *Generator) RegisterFactory(t reflect.Type, factory Factory) {
	if g.custom == nil {
		g.custom = make(map[reflect.Type]Factory)
	}
	if factory == nil {
		delete(g.custom, t)
		return
	}
	g.custom[t] = factory
}

// Generate produces a value shaped after the provided prototype.
func (g *Generator) Generate(proto any) (any, error) {
	if proto == nil {
		return nil, errors.New("nil prototype")
	}

	t := reflect.TypeOf(proto)
	visited := make(map[reflect.Type]int)

	value, err := g.buildValue(t, nil, visited, 0)
	if err != nil {
		return nil, err
	}

	if t.Kind() == reflect.Struct {
		ptr := reflect.New(t)
		ptr.Elem().Set(value.Convert(t))
		return ptr.Interface(), nil
	}

	return value.Interface(), nil
}

func (g *Generator) buildValue(t reflect.Type, field *reflect.StructField, visited map[reflect.Type]int, depth int) (reflect.Value, error) {
	if depth > g.maxDepth {
		return reflect.Zero(t), fmt.Errorf("%w: depth limit reached for %s", ErrUnsupportedSample, t)
	}

	ctx := &Context{Generator: g, Type: t, Field: field, Depth: depth}
	if field != nil {
		ctx.Tag = parseTLBTag(field.Tag.Get("tlb"))
	}

	if factory, ok := g.custom[t]; ok {
		return factory(ctx)
	}

	switch t.Kind() {
	case reflect.Pointer:
		if field != nil {
			ctx.Tag = parseTLBTag(field.Tag.Get("tlb"))
		}
		if factory, ok := g.custom[t]; ok {
			return factory(ctx)
		}
		if ctx.Tag.Maybe() && g.rng.Float64() < g.pointerNilProb {
			return reflect.Zero(t), nil
		}
		elemVal, err := g.buildValue(t.Elem(), field, visited, depth+1)
		if err != nil {
			return reflect.Value{}, err
		}
		ptr := reflect.New(t.Elem())
		if elemVal.IsValid() {
			//nolint:gocritic // ok for tests
			if elemVal.Type().AssignableTo(t.Elem()) {
				ptr.Elem().Set(elemVal)
			} else if elemVal.Type().ConvertibleTo(t.Elem()) {
				ptr.Elem().Set(elemVal.Convert(t.Elem()))
			} else {
				return reflect.Value{}, fmt.Errorf("%w: cannot assign %s to %s", ErrUnsupportedSample, elemVal.Type(), t)
			}
		}
		return ptr, nil
	case reflect.Struct:
		if visited[t] >= 2 {
			return reflect.Zero(t), fmt.Errorf("%w: recursion limit for %s", ErrUnsupportedSample, t)
		}
		visited[t]++
		defer func() { visited[t]-- }()

		val := reflect.New(t).Elem()
		for i := 0; i < t.NumField(); i++ {
			fieldInfo := t.Field(i)
			if !fieldInfo.IsExported() {
				continue
			}
			if fieldInfo.Tag.Get("json") == "-" {
				continue
			}
			if fieldInfo.Type == reflect.TypeOf(tlb.Magic{}) {
				continue
			}

			fieldVal, err := g.buildValue(fieldInfo.Type, &fieldInfo, visited, depth+1)
			if err != nil {
				return reflect.Value{}, fmt.Errorf("%w (field %s of %s)", err, fieldInfo.Name, t)
			}
			if !fieldVal.IsValid() {
				continue
			}

			target := val.Field(i)
			if fieldVal.Type().AssignableTo(target.Type()) {
				target.Set(fieldVal)
				continue
			}
			if fieldVal.Type().ConvertibleTo(target.Type()) {
				target.Set(fieldVal.Convert(target.Type()))
				continue
			}
			return reflect.Value{}, fmt.Errorf("%w: cannot assign %s to field %s (%s)", ErrUnsupportedSample, fieldVal.Type(), fieldInfo.Name, fieldInfo.Type)
		}
		return val, nil
	case reflect.Slice:
		if t.Elem().Kind() == reflect.Uint8 {
			length := g.randomByteLen(ctx.Tag)
			data := make([]byte, length)
			if _, err := g.rng.Read(data); err != nil {
				return reflect.Value{}, err
			}
			return reflect.ValueOf(data).Convert(t), nil
		}

		size := g.randomCollectionSize()
		slice := reflect.MakeSlice(t, size, size)
		for i := 0; i < size; i++ {
			item, err := g.buildValue(t.Elem(), nil, visited, depth+1)
			if err != nil {
				return reflect.Value{}, err
			}
			if item.Type().AssignableTo(t.Elem()) {
				slice.Index(i).Set(item)
				continue
			}
			if item.Type().ConvertibleTo(t.Elem()) {
				slice.Index(i).Set(item.Convert(t.Elem()))
				continue
			}
			return reflect.Value{}, fmt.Errorf("%w: cannot assign %s to slice element (%s)", ErrUnsupportedSample, item.Type(), t.Elem())
		}
		return slice, nil
	case reflect.Array:
		arr := reflect.New(t).Elem()
		for i := 0; i < arr.Len(); i++ {
			item, err := g.buildValue(t.Elem(), nil, visited, depth+1)
			if err != nil {
				return reflect.Value{}, err
			}
			if item.Type().AssignableTo(t.Elem()) {
				arr.Index(i).Set(item)
				continue
			}
			if item.Type().ConvertibleTo(t.Elem()) {
				arr.Index(i).Set(item.Convert(t.Elem()))
				continue
			}
			return reflect.Value{}, fmt.Errorf("%w: cannot assign %s to array element (%s)", ErrUnsupportedSample, item.Type(), t.Elem())
		}
		return arr, nil
	case reflect.Map:
		key, err := g.buildValue(t.Key(), nil, visited, depth+1)
		if err != nil {
			return reflect.Value{}, err
		}
		value, err := g.buildValue(t.Elem(), nil, visited, depth+1)
		if err != nil {
			return reflect.Value{}, err
		}
		mp := reflect.MakeMapWithSize(t, 1)
		keyVal, err := ensureAssignable(key, t.Key())
		if err != nil {
			return reflect.Value{}, err
		}
		valVal, err := ensureAssignable(value, t.Elem())
		if err != nil {
			return reflect.Value{}, err
		}
		mp.SetMapIndex(keyVal, valVal)
		return mp, nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		bits := g.intBitLength(t, ctx.Tag)
		v := reflect.New(t).Elem()
		v.SetInt(g.randomSignedInt(bits))
		return v, nil
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		bits := g.intBitLength(t, ctx.Tag)
		v := reflect.New(t).Elem()
		v.SetUint(g.randomUnsignedInt(bits))
		return v, nil
	case reflect.Float32, reflect.Float64:
		v := reflect.New(t).Elem()
		v.SetFloat(g.rng.Float64())
		return v, nil
	case reflect.Bool:
		return reflect.ValueOf(g.rng.Intn(2) == 1).Convert(t), nil
	case reflect.String:
		return reflect.ValueOf(fmt.Sprintf("sample-%d", g.rng.Intn(1_000_000))).Convert(t), nil
	case reflect.Interface:
		return reflect.Zero(t), nil
	default:
		return reflect.Value{}, fmt.Errorf("%w: no generator for %s", ErrUnsupportedSample, t)
	}
}

func (g *Generator) randomCollectionSize() int {
	if g.maxCollectionItems <= 0 {
		return 1
	}
	return 1 + g.rng.Intn(g.maxCollectionItems)
}

func (g *Generator) randomByteLen(tag tlbTagHint) int {
	if length, ok := tag.ByteLen(); ok && length > 0 {
		return length
	}
	return 1 + g.rng.Intn(32)
}

func (g *Generator) randomUnsignedInt(bits int) uint64 {
	if bits <= 0 {
		bits = 64
	}
	if bits >= 64 {
		return g.rng.Uint64()
	}
	mask := (uint64(1) << uint(bits)) - 1 //nolint:gosec // safe for tests
	return g.rng.Uint64() & mask
}

func (g *Generator) randomSignedInt(bits int) int64 {
	if bits <= 0 {
		bits = 63
	}
	if bits >= 63 {
		return g.rng.Int63()
	}
	limit := (int64(1) << uint(bits)) - 1 //nolint:gosec // safe for tests
	value := g.rng.Int63n(limit + 1)
	if g.rng.Intn(2) == 0 {
		return -value
	}
	return value
}

func (g *Generator) intBitLength(t reflect.Type, tag tlbTagHint) int {
	if bits, ok := tag.IntBitLen(); ok {
		return bits
	}
	if size := t.Bits(); size > 0 {
		return size
	}
	switch t.Kind() {
	case reflect.Int, reflect.Int64, reflect.Uint, reflect.Uint64, reflect.Uintptr:
		return 64
	default:
		return t.Bits()
	}
}

func (g *Generator) randomDictionary(keyBits int) (*cell.Dictionary, error) {
	if keyBits <= 0 {
		keyBits = 16
	}

	dict := cell.NewDict(uint(keyBits))
	entries := g.randomCollectionSize()
	for i := 0; i < entries; i++ {
		keyBuilder := cell.BeginCell()
		switch {
		case keyBits <= 64:
			mask := (uint64(1) << uint(keyBits)) - 1 //nolint:gosec // safe for tests
			if keyBits == 64 {
				mask = ^uint64(0)
			}
			keyBuilder.MustStoreUInt(g.rng.Uint64()&mask, uint(keyBits)) //nolint:gosec // safe for tests
		case keyBits <= 256:
			keyValue := g.randomBigInt(keyBits)
			keyBuilder.MustStoreBigUInt(keyValue, uint(keyBits))
		default:
			byteLen := (keyBits + 7) / 8
			keyBuilder.MustStoreSlice(make([]byte, byteLen), uint(keyBits))
		}

		valueBuilder := cell.BeginCell()
		valueBuilder.MustStoreUInt(uint64(g.rng.Uint32()), 32)

		if err := dict.Set(keyBuilder.EndCell(), valueBuilder.EndCell()); err != nil {
			return nil, err
		}
	}
	return dict, nil
}

func (g *Generator) randomBigInt(bits int) *big.Int {
	if bits <= 0 {
		return big.NewInt(0)
	}
	limit := new(big.Int).Lsh(big.NewInt(1), uint(bits))
	if limit.Sign() == 0 {
		return big.NewInt(0)
	}
	val := new(big.Int).Rand(g.rng, limit)
	return val
}

func ensureAssignable(value reflect.Value, targetType reflect.Type) (reflect.Value, error) {
	if value.Type().AssignableTo(targetType) {
		return value, nil
	}
	if value.Type().ConvertibleTo(targetType) {
		return value.Convert(targetType), nil
	}
	return reflect.Value{}, fmt.Errorf("%w: cannot assign %s to %s", ErrUnsupportedSample, value.Type(), targetType)
}

// TODO: all these should be injected via options (to avoid circular dependencies)
func buildDefaultFactories() map[reflect.Type]Factory {
	coinsVal := tlb.MustFromTON("0.125")
	return map[reflect.Type]Factory{
		reflect.TypeOf(coinsVal): func(ctx *Context) (reflect.Value, error) {
			return reflect.ValueOf(coinsVal), nil
		},
		reflect.TypeOf(&coinsVal): func(ctx *Context) (reflect.Value, error) {
			c := coinsVal
			return reflect.ValueOf(&c), nil
		},
		reflect.TypeOf(tlbe.Uint256{}): func(ctx *Context) (reflect.Value, error) {
			val := ctx.Generator.randomBigInt(256)
			return reflect.ValueOf(*tlbe.NewUint256(val)), nil
		},
		reflect.TypeOf((*tlbe.Uint256)(nil)): func(ctx *Context) (reflect.Value, error) {
			val := ctx.Generator.randomBigInt(256)
			return reflect.ValueOf(tlbe.NewUint256(val)), nil
		},
		reflect.TypeOf(big.Int{}): func(ctx *Context) (reflect.Value, error) {
			bits, ok := ctx.Tag.IntBitLen()
			if !ok || bits <= 0 {
				bits = 256
			}
			val := ctx.Generator.randomBigInt(bits)
			return reflect.ValueOf(*val), nil
		},
		reflect.TypeOf(&big.Int{}): func(ctx *Context) (reflect.Value, error) {
			bits, ok := ctx.Tag.IntBitLen()
			if !ok || bits <= 0 {
				bits = 256
			}
			val := ctx.Generator.randomBigInt(bits)
			return reflect.ValueOf(val), nil
		},
		reflect.TypeOf((*address.Address)(nil)): func(*Context) (reflect.Value, error) {
			addr := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")
			return reflect.ValueOf(addr), nil
		},
		reflect.TypeOf(address.Address{}): func(*Context) (reflect.Value, error) {
			addr := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")
			return reflect.ValueOf(*addr), nil
		},
		reflect.TypeOf((*cell.Cell)(nil)): func(ctx *Context) (reflect.Value, error) {
			builder := cell.BeginCell()
			builder.MustStoreUInt(uint64(ctx.Generator.rng.Intn(32)), 5) //nolint:gosec // safe for tests
			return reflect.ValueOf(builder.EndCell()), nil
		},
		reflect.TypeOf((*cell.Dictionary)(nil)): func(ctx *Context) (reflect.Value, error) {
			keyBits, ok := ctx.Tag.DictKeyBitLen()
			if !ok {
				keyBits = 16
			}
			dict, err := ctx.Generator.randomDictionary(keyBits)
			if err != nil {
				return reflect.Value{}, err
			}
			return reflect.ValueOf(dict), nil
		},
		reflect.TypeOf(common.CrossChainAddress{}): func(ctx *Context) (reflect.Value, error) {
			length := ctx.Generator.randomByteLen(ctx.Tag)
			if length > 64 {
				length = 64
			}
			data := make([]byte, length)
			if _, err := ctx.Generator.rng.Read(data); err != nil {
				return reflect.Value{}, err
			}
			// Enforce non-zero length to satisfy TL-B decoding expectations.
			if length == 0 {
				data = []byte{0x01}
			}
			return reflect.ValueOf(common.CrossChainAddress(data)), nil
		},
		reflect.TypeOf(&tlbe.Dict[uint8, uint8]{}): func(ctx *Context) (reflect.Value, error) {
			d := tlbe.NewEmptyDict[uint8, uint8]()
			d.Set(1, 42)
			return reflect.ValueOf(d), nil
		},
		reflect.TypeOf(&tlbe.Dict[uint8, mcms.Signer]{}): func(ctx *Context) (reflect.Value, error) {
			d := tlbe.NewEmptyDict[uint8, mcms.Signer]()
			return reflect.ValueOf(d), nil
		},
		reflect.TypeOf(tlbe.Dict[uint16, common.AddressWrap]{}): func(ctx *Context) (reflect.Value, error) {
			keyBits := 16
			wrappedDict := tlbe.Dict[uint16, common.AddressWrap]{}

			entries := ctx.Generator.randomCollectionSize()
			for i := 0; i < entries; i++ {
				key := uint16(ctx.Generator.rng.Intn(1 << keyBits)) //nolint:gosec // keyBits := 16
				var api wallet.TonAPI
				w, err := tvm.NewRandomV5R1TestWallet(api, -217)
				if err != nil {
					return reflect.Value{}, err
				}
				addr := w.Address()
				wrappedDict.Set(key, common.AddressWrap{Val: addr})
			}
			return reflect.ValueOf(wrappedDict), nil
		},
	}
}

func parseTLBTag(tag string) tlbTagHint {
	info := tlbTagHint{raw: tag}
	if tag == "" {
		return info
	}

	tokens := strings.Fields(tag)
	for i := 0; i < len(tokens); i++ {
		tok := tokens[i]
		switch tok {
		case "bits":
			if i+1 < len(tokens) {
				if bits, err := strconv.Atoi(tokens[i+1]); err == nil {
					info.bitSize = bits
					info.hasBitSize = true
				}
				i++
			}
		case "##":
			if i+1 < len(tokens) {
				if bits, err := strconv.Atoi(tokens[i+1]); err == nil {
					info.intBits = bits
					info.hasIntBits = true
				}
				i++
			}
		case "dict":
			if i+1 < len(tokens) {
				if bits, err := strconv.Atoi(tokens[i+1]); err == nil {
					info.dictKeyBits = bits
					info.hasDictBits = true
				}
				i++
			}
		case "maybe":
			info.maybe = true
		}
	}

	return info
}
