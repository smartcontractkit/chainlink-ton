package ton

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
)

// OneOf represents a configuration value that can be either:
//   - A simple value: "key"
//   - An object with items: {key: [item1, item2]}
//
// This provides a generic, reusable structure for parsing flexible YAML/JSON
// configurations where entries can be simple identifiers or include nested lists.
//
// The type T must have a pointer receiver method:
//
//	Unmarshal(key string, items []interface{}) error
//
// Examples:
//   - OneOf[TargetSpec]: Parse "MCMS" or {MCMS: ["CLLCCIP", "RMNMCMS"]}
type OneOf[T any] struct {
	ResultingValue T
}

func unmarshalKeyedStruct(unmarshal func(interface{}) error) (string, []interface{}, error) {
	// Try parsing as a simple string first
	var str string
	if err := unmarshal(&str); err == nil {
		return str, nil, nil
	}

	// Try parsing as an object with items: {key: [items]}
	var obj map[string][]interface{}
	if err := unmarshal(&obj); err != nil {
		return "", nil, fmt.Errorf("value must be a string or object with items: %w", err)
	}

	if len(obj) != 1 {
		return "", nil, errors.New("object must have exactly one key")
	}

	for key, items := range obj {
		return key, items, nil
	}

	return "", nil, errors.New("invalid format")
}

// reflectUnmarshal uses reflection to call the Unmarshal method on a pointer to the given value.
// The value's pointer type must have a method: Unmarshal(key string, items []interface{}) error
func reflectUnmarshal[T any](ptr *T, key string, items []interface{}) error {
	// Use reflection to call the Unmarshal method on the pointer
	v := reflect.ValueOf(ptr)
	method := v.MethodByName("Unmarshal")
	if !method.IsValid() {
		return fmt.Errorf("type %T does not have an Unmarshal method with pointer receiver", *ptr)
	}

	// Call Unmarshal(key string, items []interface{}) error
	results := method.Call([]reflect.Value{
		reflect.ValueOf(key),
		reflect.ValueOf(items),
	})

	if len(results) != 1 {
		return fmt.Errorf("Unmarshal method must return exactly one value (error)")
	}

	// Check if there was an error
	if !results[0].IsNil() {
		return results[0].Interface().(error)
	}

	return nil
}

// UnmarshalYAML implements custom YAML unmarshaling to handle both string and object formats
func (o *OneOf[T]) UnmarshalYAML(unmarshal func(interface{}) error) error {
	key, items, err := unmarshalKeyedStruct(unmarshal)
	if err != nil {
		return err
	}
	err = reflectUnmarshal(&o.ResultingValue, key, items)
	if err != nil {
		return fmt.Errorf("failed to unmarshal OneOf value: %w", err)
	}
	return nil
}

// UnmarshalJSON implements custom JSON unmarshaling (same logic as YAML)
func (o *OneOf[T]) UnmarshalJSON(data []byte) error {
	key, items, err := unmarshalKeyedStruct(func(v interface{}) error {
		return json.Unmarshal(data, v)
	})
	if err != nil {
		return err
	}
	err = reflectUnmarshal(&o.ResultingValue, key, items)
	if err != nil {
		return fmt.Errorf("failed to unmarshal OneOf value: %w", err)
	}
	return nil
}
