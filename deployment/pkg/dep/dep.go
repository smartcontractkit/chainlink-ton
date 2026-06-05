package dep

import (
	"errors"
	"fmt"
	"reflect"
	"sync"
)

// DependencyProvider offers typed access to registered dependencies.
// It is immutable after construction; use With to create scoped overrides.
type DependencyProvider struct {
	state *providerState
}

// Registration represents a dependency binding that can be applied to a provider.
type Registration func(*providerState) error

// Factory represents a function that produces a dependency on demand.
type Factory[T any] func(*DependencyProvider) (T, error)

var (
	// ErrDependencyNotFound indicates that a requested dependency was not registered.
	ErrDependencyNotFound = errors.New("dependency not found")

	// ErrDependencyAlreadyRegistered indicates that a dependency binding already exists in the scope.
	ErrDependencyAlreadyRegistered = errors.New("dependency already registered")

	// ErrDependencyTypeMismatch indicates that the resolved dependency cannot be used as the requested type.
	ErrDependencyTypeMismatch = errors.New("dependency type mismatch")
)

// NewDependencyProvider builds a provider from the supplied registrations.
func NewDependencyProvider(registrations ...Registration) (*DependencyProvider, error) {
	state := newProviderState(nil)
	if err := state.apply(registrations...); err != nil {
		return nil, err
	}

	return &DependencyProvider{state: state}, nil
}

// With returns a new provider that inherits the current bindings and applies overrides scoped to the result.
func (p *DependencyProvider) With(registrations ...Registration) (*DependencyProvider, error) {
	if p == nil {
		return nil, errors.New("cannot create scoped provider from nil DependencyProvider")
	}

	state := newProviderState(p.state)
	if err := state.apply(registrations...); err != nil {
		return nil, err
	}

	return &DependencyProvider{state: state}, nil
}

// Resolve retrieves the dependency registered for the requested type.
func Resolve[T any](provider *DependencyProvider) (T, error) {
	var zero T
	key := typeKey[T]()

	if provider == nil {
		return zero, fmt.Errorf("%w: %s", ErrDependencyNotFound, key)
	}

	value, err := provider.resolve(key)
	if err != nil {
		return zero, err
	}

	typed, ok := value.(T)
	if !ok {
		return zero, fmt.Errorf("%w: requested %s but registered %T", ErrDependencyTypeMismatch, key, value)
	}

	return typed, nil
}

// MustResolve retrieves the dependency or panics when it cannot be resolved.
func MustResolve[T any](provider *DependencyProvider) T {
	value, err := Resolve[T](provider)
	if err != nil {
		panic(err)
	}

	return value
}

func (p *DependencyProvider) resolve(key reflect.Type) (any, error) {
	if p == nil || p.state == nil {
		return nil, fmt.Errorf("%w: %s", ErrDependencyNotFound, key)
	}

	entry, ok := p.state.lookup(key)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrDependencyNotFound, key)
	}

	return entry.resolve(p)
}

// Provide registers a concrete dependency for its own type.
func Provide[T any](value T) Registration {
	return func(state *providerState) error {
		entry := newValueEntry(any(value))
		return state.register(typeKey[T](), entry)
	}
}

// ProvideAs registers a dependency so it can be retrieved as the target type.
func ProvideAs[T any, As any](value T) Registration {
	return func(state *providerState) error {
		converted, ok := any(value).(As)
		if !ok {
			return fmt.Errorf("%w: %T does not implement %s", ErrDependencyTypeMismatch, value, typeKey[As]())
		}

		entry := newValueEntry(any(converted))
		return state.register(typeKey[As](), entry)
	}
}

// ProvideFactory registers a lazy factory that produces the dependency on first use.
func ProvideFactory[T any](factory Factory[T]) Registration {
	return func(state *providerState) error {
		if factory == nil {
			return fmt.Errorf("nil factory for %s", typeKey[T]())
		}

		entry := newFactoryEntry(func(provider *DependencyProvider) (any, error) {
			value, err := factory(provider)
			if err != nil {
				return nil, err
			}

			return any(value), nil
		})

		return state.register(typeKey[T](), entry)
	}
}

// ProvideFactoryAs registers a lazy factory for the target type, casting the produced value.
func ProvideFactoryAs[T any, As any](factory Factory[T]) Registration {
	return func(state *providerState) error {
		if factory == nil {
			return fmt.Errorf("nil factory for %s", typeKey[As]())
		}

		entry := newFactoryEntry(func(provider *DependencyProvider) (any, error) {
			value, err := factory(provider)
			if err != nil {
				return nil, err
			}

			converted, ok := any(value).(As)
			if !ok {
				return nil, fmt.Errorf("%w: %T does not implement %s", ErrDependencyTypeMismatch, value, typeKey[As]())
			}

			return any(converted), nil
		})

		return state.register(typeKey[As](), entry)
	}
}

// Has reports whether the type has a binding in the provider hierarchy.
func Has[T any](provider *DependencyProvider) bool {
	if provider == nil || provider.state == nil {
		return false
	}

	key := typeKey[T]()
	_, ok := provider.state.lookup(key)
	return ok
}

// providerState represents the internal state of a DependencyProvider.
type providerState struct {
	// parent is the parent scope; nil if root
	// entries holds the registered dependencies in this scope so every With call
	// builds a new scope instead of mutating shared state; that preserves immutability
	// and prevents overrides from leaking back up the chain.
	parent  *providerState
	entries map[reflect.Type]*dependencyEntry
}

func newProviderState(parent *providerState) *providerState {
	return &providerState{
		parent:  parent,
		entries: make(map[reflect.Type]*dependencyEntry),
	}
}

func (s *providerState) apply(registrations ...Registration) error {
	for _, registration := range registrations {
		if registration == nil {
			continue
		}

		if err := registration(s); err != nil {
			return fmt.Errorf("apply registration failed: %w", err)
		}
	}

	return nil
}

func (s *providerState) register(key reflect.Type, entry *dependencyEntry) error {
	if key == nil {
		return errors.New("cannot register dependency with nil type")
	}

	if entry == nil {
		return errors.New("cannot register nil dependency entry")
	}

	if _, exists := s.entries[key]; exists {
		return fmt.Errorf("%w: %s", ErrDependencyAlreadyRegistered, key)
	}

	s.entries[key] = entry
	return nil
}

func (s *providerState) lookup(key reflect.Type) (*dependencyEntry, bool) {
	for current := s; current != nil; current = current.parent {
		if entry, ok := current.entries[key]; ok {
			return entry, true
		}
	}

	return nil, false
}

type dependencyEntry struct {
	factory Factory[any]
	once    sync.Once
	value   any
	err     error
}

func newValueEntry(value any) *dependencyEntry {
	return &dependencyEntry{value: value}
}

func newFactoryEntry(factory Factory[any]) *dependencyEntry {
	return &dependencyEntry{factory: factory}
}

func (e *dependencyEntry) resolve(provider *DependencyProvider) (any, error) {
	if e.factory == nil {
		return e.value, nil
	}

	e.once.Do(func() {
		e.value, e.err = e.factory(provider)
	})

	return e.value, e.err
}

func typeKey[T any]() reflect.Type {
	return reflect.TypeFor[T]()
}
