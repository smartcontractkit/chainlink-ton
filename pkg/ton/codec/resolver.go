package codec

import (
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
		return &typedResolver[IN, OUT]{
			key:      key,
			resolver: resolver,
			// Add custom CanResolve implementation
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
	return &typedResolver[IN, OUT]{
		key:      key,
		resolver: resolver,
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
	if r.canResolve != nil {
		return r.canResolve(input)
	}

	// Default implementation: check type assertion
	_, ok := input.(IN)
	return ok
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

// resolveOnce attempts to resolve a value once using any matching resolver
func (r *ResolverRegistry) resolveOnce(value any) (resolved any, changed bool, err error) {
	// Handle resolver instruction maps (explicit "resolver" key)
	if m, ok := value.(map[string]any); ok {
		if resolverType, hasResolver := m["resolver"].(string); hasResolver {
			resolved, err := r.resolveWithType(m, resolverType)
			return resolved, true, err
		}
	}

	// Try each resolver to see if it can handle this value
	for _, resolver := range r.resolvers {
		if resolver.CanResolve(value) {
			resolved, err := resolver.Resolve(value)
			if err != nil {
				continue // try next resolver
			}
			return resolved, true, nil
		}
	}

	// No resolver matched
	return value, false, nil
}

// resolveWithType resolves a value using a specific resolver type
func (r *ResolverRegistry) resolveWithType(input map[string]any, resolverType string) (any, error) {
	resolver, ok := r.resolvers[resolverType]
	if ok {
		resolved, err := resolver.Resolve(input)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve with resolver %s: %w", resolverType, err)
		}
		return resolved, nil
	}

	return nil, fmt.Errorf("no resolver found for type %s", resolverType)
}

// Resolve is a convenience method that handles any input type
func (r *ResolverRegistry) Resolve(input any) (any, error) {
	return r.resolveDeep(input, 0)
}
