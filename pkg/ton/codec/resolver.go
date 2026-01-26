package codec

import (
	"errors"
	"fmt"
	"reflect"
)

// Resolver is a generic interface for resolving input to output
type Resolver[IN any, OUT any] interface {
	Resolve(in IN) (OUT, error)
}

// ResolverChecker checks if a resolver can handle a given input
type ResolverChecker[IN any] interface {
	CanResolve(in IN) bool
}

// ResolverKeyProvider provides a key for identifying the resolver
type ResolverKeyProvider interface {
	Key() string
}

// TypedResolver wraps a resolver with type information for dynamic dispatch
type TypedResolver interface {
	// ResolverChecker.CanResolve checks if this resolver can handle the given input type
	ResolverChecker[any]
	// Resolver.Resolve performs the resolution, returning the resolved value
	Resolver[any, any]
	// ResolverKeyProvider.Key returns the unique key for this resolver
	ResolverKeyProvider
	// InputType returns the reflect.Type this resolver accepts
	InputType() reflect.Type
	// OutputType returns the reflect.Type this resolver produces
	OutputType() reflect.Type
}

// NewTypedResolver creates a TypedResolver from a generic Resolver
func NewTypedResolver[IN any, OUT any](resolver Resolver[IN, OUT]) TypedResolver {
	var key string
	if resolverWithKey, ok := resolver.(ResolverKeyProvider); ok {
		key = resolverWithKey.Key()
	} else {
		// Use type name as key by default
		key = reflect.TypeOf(resolver).String()
	}

	return NewTypedResolverWith(resolver, key)
}

// NewTypedResolverWith creates a TypedResolver from a generic Resolver with a specified key
func NewTypedResolverWith[IN any, OUT any](resolver Resolver[IN, OUT], key string) TypedResolver {
	if resolverWithCheck, ok := resolver.(ResolverChecker[IN]); ok {
		// Custom CanResolve implementation
		return &typedResolver[IN, OUT]{
			key:      key,
			resolver: resolver,
			canResolve: func(in any) bool {
				if in == nil {
					return false
				}

				_, ok := in.(IN)
				if !ok {
					return false
				}

				return resolverWithCheck.CanResolve(in.(IN))
			},
		}
	}

	if resolverWithKey, ok := resolver.(ResolverKeyProvider); ok {
		// Standard CanResolve implementation which validates the key
		return &typedResolver[IN, OUT]{
			key:      resolverWithKey.Key(),
			resolver: resolver,
			canResolve: func(in any) bool {
				if in == nil {
					return false
				}

				// Handle resolver instruction maps (explicit "resolver" key)
				m, ok := in.(map[string]any)
				if !ok {
					return false
				}

				resolverType, ok := m["resolver"].(string)
				if !ok {
					return false
				}

				// Check if the resolver type matches
				return resolverType == resolverWithKey.Key()
			},
		}
	}

	// Default implementation: check type assertion
	return &typedResolver[IN, OUT]{
		key:      key,
		resolver: resolver,
		canResolve: func(in any) bool {
			_, ok := in.(IN)
			return ok
		},
	}
}

type typedResolver[IN any, OUT any] struct {
	key        string            // Resolver key
	resolver   Resolver[IN, OUT] // Underlying resolver
	canResolve func(any) bool    // Override for CanResolve method
}

func (r *typedResolver[IN, OUT]) Key() string {
	return r.key
}

func (r *typedResolver[IN, OUT]) CanResolve(input any) bool {
	return r.canResolve(input)
}

func (r *typedResolver[IN, OUT]) Resolve(input any) (any, error) {
	in, ok := input.(IN)
	if !ok {
		return nil, fmt.Errorf("invalid input type: expected %T, got %T", *new(IN), input)
	}
	return r.resolver.Resolve(in)
}

func (r *typedResolver[IN, OUT]) InputType() reflect.Type {
	var zeroIN IN
	return reflect.TypeOf(zeroIN)
}

func (r *typedResolver[IN, OUT]) OutputType() reflect.Type {
	var zeroOUT OUT
	return reflect.TypeOf(zeroOUT)
}

// ResolverRegistry manages a collection of typed resolvers
type ResolverRegistry struct {
	resolvers map[string]TypedResolver
}

// NewResolverRegistry creates a new ResolverRegistry with optional initial resolvers
func NewResolverRegistry(resolvers ...TypedResolver) *ResolverRegistry {
	resolverMap := make(map[string]TypedResolver)
	for _, r := range resolvers {
		resolverMap[r.Key()] = r
	}

	return &ResolverRegistry{
		resolvers: resolverMap,
	}
}

// Register adds a resolver to the registry
func (r *ResolverRegistry) Register(resolver TypedResolver) {
	r.resolvers[resolver.Key()] = resolver
}

const maxResolutionDepth = 100

// resolveDeep performs depth-first resolution (using registered resolvers) with a maximum depth limit
func (r *ResolverRegistry) resolveDeep(value any, depth int) (any, error) {
	if depth >= maxResolutionDepth {
		return nil, fmt.Errorf("exceeded maximum resolution depth of %d", maxResolutionDepth)
	}

	// 1. Resolve nested collections first (depth-first)
	normalized, err := r.resolveCollections(value, depth)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve collections: %w", err)
	}

	// 2. Try to resolve the current value itself
	resolved, changed, err := r.resolveOnce(normalized)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve value: %w", err)
	}
	if !changed {
		return normalized, nil
	}

	// 3. Recursively process the newly resolved value (it might expand into more collections)
	return r.resolveDeep(resolved, depth+1)
}

func (r *ResolverRegistry) resolveCollections(value any, depth int) (any, error) {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, val := range v {
			resolved, err := r.resolveDeep(val, depth+1)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve key %q: %w", key, err)
			}
			out[key] = resolved
		}
		return out, nil
	case []any:
		out := make([]any, len(v))
		for i, val := range v {
			resolved, err := r.resolveDeep(val, depth+1)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve slice index %d: %w", i, err)
			}
			out[i] = resolved
		}
		return out, nil
	default:
		return value, nil
	}
}

// NonFatalResolverError indicates that resolution error is non-fatal and the resolver should be skipped
type NonFatalResolverError struct{ cause error }

func NewNonFatalResolverError(cause error) NonFatalResolverError {
	return NonFatalResolverError{cause: cause}
}

func (e NonFatalResolverError) Error() string {
	return fmt.Sprintf("skip resolver: %v", e.cause)
}

// resolveOnce attempts to resolve a value once using any matching resolver
func (r *ResolverRegistry) resolveOnce(value any) (resolved any, changed bool, err error) {
	// Try each resolver to see if it can handle this value
	for _, resolver := range r.resolvers {
		if resolver.CanResolve(value) {
			resolved, err := resolver.Resolve(value)
			if err != nil {
				if errors.As(err, &NonFatalResolverError{}) {
					continue // try next resolver (non-fatal error)
				}

				return nil, false, fmt.Errorf("resolver %q failed: %w", resolver.Key(), err)
			}
			return resolved, true, err
		}
	}

	// No resolver matched
	return value, false, nil
}

// Resolve is a convenience method that handles any input type
func (r *ResolverRegistry) Resolve(input any) (any, error) {
	return r.resolveDeep(input, 0)
}
