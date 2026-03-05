package explorer

import (
	"bufio"
	"errors"
	"fmt"
	"math/big"
	"os"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/term"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type getterArgSpec struct {
	Name       string
	Type       reflect.Type
	FieldIndex int
}

type getterDescriptor struct {
	MethodName string
	InputType  reflect.Type
	ArgSpecs   []getterArgSpec
	Decode     func(*ton.ExecutionResult) (any, error)
	Encode     func(any) ([]any, error)
}

func listGetterNames(contractType string) []string {
	availableSet := make(map[string]struct{})
	collectGetterNames(availableSet, bindings.TypeToGetterMap[contractType])
	collectGetterNames(availableSet, bindings.TypeToGetterMap["link.chain.ton.ccip.Common"])
	collectGetterNames(availableSet, bindings.TypeToGetterMap[bindings.TypeOwnable])

	available := make([]string, 0, len(availableSet))
	for name := range availableSet {
		available = append(available, name)
	}
	sort.Strings(available)
	return available
}

func collectGetterNames(dest map[string]struct{}, getterMap bindings.GetterMap) {
	for name := range getterMap {
		dest[name] = struct{}{}
	}
}

func resolveGetterDescriptor(contractType string, getterName string) (getterDescriptor, error) {
	getter, found := resolveRegisteredGetter(contractType, getterName)
	if !found {
		available := listGetterNames(contractType)
		if len(available) == 0 {
			return getterDescriptor{}, fmt.Errorf("no getters registered for contract type %q", contractType)
		}
		return getterDescriptor{}, fmt.Errorf("getter %q is not registered for %q (available: %s)", getterName, contractType, strings.Join(available, ", "))
	}

	desc, err := describeGetter(getter)
	if err != nil {
		return getterDescriptor{}, fmt.Errorf("unsupported getter %q: %w", getterName, err)
	}
	return desc, nil
}

func describeGetter(getter any) (getterDescriptor, error) {
	value := reflect.ValueOf(getter)
	if value.Kind() != reflect.Struct {
		return getterDescriptor{}, fmt.Errorf("registered getter has unsupported shape %T", getter)
	}

	nameField := value.FieldByName("Name")
	if !nameField.IsValid() || nameField.Kind() != reflect.String || nameField.String() == "" {
		return getterDescriptor{}, fmt.Errorf("registered getter has invalid Name field %T", getter)
	}

	decoderField := value.FieldByName("Decoder")
	if !decoderField.IsValid() || decoderField.IsNil() {
		return getterDescriptor{}, errors.New("getter has no decoder")
	}
	decodeMethod := decoderField.MethodByName("Decode")
	if !decodeMethod.IsValid() {
		return getterDescriptor{}, errors.New("getter decoder has no Decode method")
	}

	encoderField := value.FieldByName("Encoder")
	if !encoderField.IsValid() {
		return getterDescriptor{}, errors.New("getter has no encoder information")
	}

	inputType, err := inferGetterInputType(encoderField)
	if err != nil {
		return getterDescriptor{}, err
	}

	encodeFn, err := buildEncodeFunction(encoderField)
	if err != nil {
		return getterDescriptor{}, err
	}

	argSpecs := buildArgSpecs(inputType)

	decodeFn := func(result *ton.ExecutionResult) (any, error) {
		outs := decodeMethod.Call([]reflect.Value{reflect.ValueOf(result)})
		if len(outs) != 2 {
			return nil, errors.New("getter decoder returned unexpected values")
		}
		if !outs[1].IsNil() {
			err, ok := outs[1].Interface().(error)
			if !ok {
				return nil, errors.New("getter decoder returned non-error second value")
			}
			return nil, err
		}
		return outs[0].Interface(), nil
	}

	return getterDescriptor{
		MethodName: nameField.String(),
		InputType:  inputType,
		ArgSpecs:   argSpecs,
		Decode:     decodeFn,
		Encode:     encodeFn,
	}, nil
}

func inferGetterInputType(encoderField reflect.Value) (reflect.Type, error) {
	encodeMethodType, err := findEncodeMethodType(encoderField)
	if err != nil {
		return nil, err
	}
	if encodeMethodType.NumIn() == 1 {
		return encodeMethodType.In(0), nil
	}
	if encodeMethodType.NumIn() == 2 {
		// Method signatures discovered from interface types include receiver as arg 0.
		return encodeMethodType.In(1), nil
	}
	if encodeMethodType.NumIn() == 0 {
		return nil, errors.New("getter encoder has unexpected Encode signature")
	}
	if encodeMethodType.NumIn() > 2 {
		return nil, errors.New("getter encoder has unexpected Encode signature")
	}
	return nil, errors.New("getter encoder has unexpected Encode signature")
}

func findEncodeMethodType(encoderField reflect.Value) (reflect.Type, error) {
	if !encoderField.IsNil() {
		encodeMethod := encoderField.MethodByName("Encode")
		if !encodeMethod.IsValid() {
			return nil, errors.New("getter encoder has no Encode method")
		}
		return encodeMethod.Type(), nil
	}

	t := encoderField.Type()
	m, ok := t.MethodByName("Encode")
	if !ok {
		return nil, errors.New("getter encoder type has no Encode method")
	}
	return m.Type, nil
}

func buildEncodeFunction(encoderField reflect.Value) (func(any) ([]any, error), error) {
	if !encoderField.IsNil() {
		encodeMethod := encoderField.MethodByName("Encode")
		if !encodeMethod.IsValid() {
			return nil, errors.New("getter encoder has no Encode method")
		}

		return func(input any) ([]any, error) {
			outs := encodeMethod.Call([]reflect.Value{reflect.ValueOf(input)})
			if len(outs) != 2 {
				return nil, errors.New("getter encoder returned unexpected values")
			}
			if !outs[1].IsNil() {
				err, ok := outs[1].Interface().(error)
				if !ok {
					return nil, errors.New("getter encoder returned non-error second value")
				}
				return nil, err
			}
			params, ok := outs[0].Interface().([]any)
			if !ok {
				return nil, errors.New("getter encoder returned non-[]any params")
			}
			return params, nil
		}, nil
	}

	return func(input any) ([]any, error) {
		return encodeArgsDefault(input)
	}, nil
}

func buildArgSpecs(inputType reflect.Type) []getterArgSpec {
	if isNoArgsInputType(inputType) {
		return nil
	}

	if inputType.Kind() != reflect.Struct {
		return []getterArgSpec{{Name: "arg1", Type: inputType, FieldIndex: -1}}
	}

	out := make([]getterArgSpec, 0, inputType.NumField())
	for i := 0; i < inputType.NumField(); i++ {
		field := inputType.Field(i)
		if !field.IsExported() || field.Tag.Get("tvm") == "-" {
			continue
		}
		out = append(out, getterArgSpec{Name: strings.ToLower(field.Name[:1]) + field.Name[1:], Type: field.Type, FieldIndex: i})
	}
	return out
}

func parseNamedArgs(argPairs []string) (map[string]string, error) {
	result := make(map[string]string, len(argPairs))
	for _, pair := range argPairs {
		name, value, ok := strings.Cut(pair, "=")
		if !ok {
			return nil, fmt.Errorf("invalid --arg %q, expected name=value", pair)
		}
		name = strings.TrimSpace(name)
		if name == "" {
			return nil, fmt.Errorf("invalid --arg %q, argument name is empty", pair)
		}
		if _, exists := result[name]; exists {
			return nil, fmt.Errorf("duplicate named arg %q", name)
		}
		result[name] = value
	}
	return result, nil
}

func buildGetterInput(desc getterDescriptor, positional []string, named map[string]string, interactive bool, cmdOut func(string) (string, error)) (any, error) {
	if len(desc.ArgSpecs) == 0 {
		return tvm.NoArgs{}, nil
	}

	if len(desc.ArgSpecs) == 1 && desc.ArgSpecs[0].FieldIndex == -1 {
		if len(positional) > 1 {
			return nil, fmt.Errorf("too many positional args: expected 1, got %d", len(positional))
		}
		if _, hasNamed := named[desc.ArgSpecs[0].Name]; hasNamed && len(positional) > 0 {
			return nil, fmt.Errorf("arg %q provided as both positional and named", desc.ArgSpecs[0].Name)
		}

		raw, err := resolveRawArgValue(desc.ArgSpecs[0], positional, named, 0, interactive, cmdOut)
		if err != nil {
			return nil, err
		}
		v, err := parseValueForType(raw, desc.ArgSpecs[0].Type)
		if err != nil {
			return nil, fmt.Errorf("arg 1 (%s): %w", desc.ArgSpecs[0].Name, err)
		}
		for name := range named {
			if name != desc.ArgSpecs[0].Name {
				return nil, fmt.Errorf("unknown named arg %q", name)
			}
		}
		return v.Interface(), nil
	}

	input := reflect.New(desc.InputType).Elem()
	usedNamed := make(map[string]bool)
	posIndex := 0
	for i, spec := range desc.ArgSpecs {
		raw, err := resolveRawArgValue(spec, positional, named, posIndex, interactive, cmdOut)
		if err != nil {
			return nil, err
		}
		if _, ok := named[spec.Name]; ok {
			usedNamed[spec.Name] = true
		} else if posIndex < len(positional) {
			posIndex++
		}

		v, err := parseValueForType(raw, spec.Type)
		if err != nil {
			return nil, fmt.Errorf("arg %d (%s): %w", i+1, spec.Name, err)
		}
		input.Field(spec.FieldIndex).Set(v)
	}

	if posIndex < len(positional) {
		return nil, fmt.Errorf("too many positional args: expected %d, got %d", len(desc.ArgSpecs), len(positional))
	}

	for name := range named {
		if !usedNamed[name] {
			return nil, fmt.Errorf("unknown named arg %q", name)
		}
	}

	return input.Interface(), nil
}

func resolveRawArgValue(spec getterArgSpec, positional []string, named map[string]string, posIndex int, interactive bool, promptFn func(string) (string, error)) (string, error) {
	if value, ok := named[spec.Name]; ok {
		return value, nil
	}
	if posIndex < len(positional) {
		return positional[posIndex], nil
	}
	if interactive {
		return promptFn(fmt.Sprintf("Enter value for %s (%s) [or 0 to cancel]: ", spec.Name, spec.Type.String()))
	}
	return "", fmt.Errorf("missing required arg %q (%s)", spec.Name, spec.Type.String())
}

func promptForArgValue(prompt string) (string, error) {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return "", errors.New("missing args in non-interactive mode")
	}
	fmt.Fprint(os.Stdout, prompt)
	reader := bufio.NewReader(os.Stdin)
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	value := strings.TrimSpace(line)
	if value == "0" {
		return "", errors.New("selection canceled")
	}
	return value, nil
}

func parseValueForType(raw string, t reflect.Type) (reflect.Value, error) {
	if t == reflect.TypeOf(tvm.NoArgs{}) {
		return reflect.ValueOf(tvm.NoArgs{}), nil
	}

	if t.Kind() == reflect.Pointer {
		if raw == "" {
			return reflect.Zero(t), nil
		}
		v, err := parseValueForType(raw, t.Elem())
		if err != nil {
			return reflect.Value{}, err
		}
		ptr := reflect.New(t.Elem())
		ptr.Elem().Set(v)
		return ptr, nil
	}

	if t == reflect.TypeOf(address.Address{}) {
		addr, err := address.ParseAddr(raw)
		if err != nil {
			return reflect.Value{}, fmt.Errorf("expected address, got %q", raw)
		}
		return reflect.ValueOf(*addr), nil
	}

	if t == reflect.TypeOf(big.Int{}) {
		v, ok := new(big.Int).SetString(raw, 10)
		if !ok {
			return reflect.Value{}, fmt.Errorf("expected decimal big.Int, got %q", raw)
		}
		return reflect.ValueOf(*v), nil
	}

	switch t.Kind() {
	case reflect.String:
		return reflect.ValueOf(raw).Convert(t), nil
	case reflect.Bool:
		b, err := strconv.ParseBool(raw)
		if err != nil {
			return reflect.Value{}, fmt.Errorf("expected bool, got %q", raw)
		}
		return reflect.ValueOf(b).Convert(t), nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		n, err := strconv.ParseInt(raw, 10, t.Bits())
		if err != nil {
			return reflect.Value{}, fmt.Errorf("expected %s, got %q", t.String(), raw)
		}
		return reflect.ValueOf(n).Convert(t), nil
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		n, err := strconv.ParseUint(raw, 10, t.Bits())
		if err != nil {
			return reflect.Value{}, fmt.Errorf("expected %s, got %q", t.String(), raw)
		}
		return reflect.ValueOf(n).Convert(t), nil
	case reflect.Slice:
		if t.Elem().Kind() == reflect.Uint8 {
			hexInput := strings.TrimPrefix(raw, "0x")
			decoded, decErr := decodeHexOrBytes(hexInput)
			if decErr != nil {
				return reflect.Value{}, fmt.Errorf("expected hex bytes, got %q", raw)
			}
			return reflect.ValueOf(decoded).Convert(t), nil
		}
	}

	return reflect.Value{}, fmt.Errorf("unsupported arg type %s", t.String())
}

func decodeHexOrBytes(raw string) ([]byte, error) {
	if len(raw)%2 == 1 {
		raw = "0" + raw
	}
	decoded := make([]byte, len(raw)/2)
	for i := 0; i < len(decoded); i++ {
		v, err := strconv.ParseUint(raw[2*i:2*i+2], 16, 8)
		if err != nil {
			return nil, err
		}
		decoded[i] = byte(v)
	}
	return decoded, nil
}

// Mirrors tvm.encodeArgsDefault behavior for nil-encoder getters.
func encodeArgsDefault(input any) ([]any, error) {
	if input == nil {
		return []any{nil}, nil
	}

	value := reflect.ValueOf(input)
	if !value.IsValid() {
		return nil, errors.New("cannot encode invalid argument value")
	}

	switch value.Kind() {
	case reflect.Interface:
		if value.IsNil() {
			return []any{nil}, nil
		}
		return encodeArgsDefault(value.Elem().Interface())
	case reflect.Pointer:
		if value.IsNil() {
			return []any{nil}, nil
		}
		return []any{value.Interface()}, nil
	case reflect.Struct:
		if value.Type() == reflect.TypeOf(tvm.NoArgs{}) {
			return []any{}, nil
		}
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
		if value.Type().Elem().Kind() == reflect.Uint8 {
			return []any{value.Interface()}, nil
		}
		length := value.Len()
		params := make([]any, length)
		for i := 0; i < length; i++ {
			params[i] = value.Index(i).Interface()
		}
		return params, nil
	default:
		return []any{value.Interface()}, nil
	}
}
