package dep

import (
	"errors"
	"sync"
	"testing"
)

type sampleInterface interface {
	Value() string
}

type sampleImpl struct {
	v string
}

func (s sampleImpl) Value() string {
	return s.v
}

func TestProvideAndResolve(t *testing.T) {
	provider, err := NewDependencyProvider(Provide(42))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	value, err := Resolve[int](provider)
	if err != nil {
		t.Fatalf("resolve failed: %v", err)
	}

	if value != 42 {
		t.Fatalf("unexpected value: %d", value)
	}
}

func TestProvideAsBindsInterface(t *testing.T) {
	impl := sampleImpl{v: "test"}

	provider, err := NewDependencyProvider(ProvideAs[sampleImpl, sampleInterface](impl))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	dep, err := Resolve[sampleInterface](provider)
	if err != nil {
		t.Fatalf("resolve failed: %v", err)
	}

	if dep.Value() != "test" {
		t.Fatalf("unexpected value: %s", dep.Value())
	}
}

func TestProvideFactoryIsLazy(t *testing.T) {
	var calls int

	provider, err := NewDependencyProvider(
		ProvideFactory(func(*DependencyProvider) (string, error) {
			calls++
			return "factory", nil
		}),
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if calls != 0 {
		t.Fatalf("factory invoked eagerly")
	}

	for range 2 {
		value, err := Resolve[string](provider)
		if err != nil {
			t.Fatalf("resolve failed: %v", err)
		}

		if value != "factory" {
			t.Fatalf("unexpected value: %s", value)
		}
	}

	if calls != 1 {
		t.Fatalf("factory invoked %d times", calls)
	}
}

func TestProvideFactoryAsCastsInterface(t *testing.T) {
	provider, err := NewDependencyProvider(
		ProvideFactoryAs[sampleImpl, sampleInterface](func(*DependencyProvider) (sampleImpl, error) {
			return sampleImpl{v: "factory"}, nil
		}),
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	dep, err := Resolve[sampleInterface](provider)
	if err != nil {
		t.Fatalf("resolve failed: %v", err)
	}

	if dep.Value() != "factory" {
		t.Fatalf("unexpected value: %s", dep.Value())
	}
}

func TestWithOverridesParentBinding(t *testing.T) {
	base, err := NewDependencyProvider(Provide("base"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	child, err := base.With(Provide("child"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	baseValue, err := Resolve[string](base)
	if err != nil {
		t.Fatalf("resolve base failed: %v", err)
	}

	childValue, err := Resolve[string](child)
	if err != nil {
		t.Fatalf("resolve child failed: %v", err)
	}

	if baseValue != "base" {
		t.Fatalf("unexpected base value: %s", baseValue)
	}

	if childValue != "child" {
		t.Fatalf("unexpected child value: %s", childValue)
	}
}

func TestResolveMissingDependency(t *testing.T) {
	provider, err := NewDependencyProvider()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err = Resolve[int](provider)
	if !errors.Is(err, ErrDependencyNotFound) {
		t.Fatalf("expected ErrDependencyNotFound, got %v", err)
	}
}

func TestConcurrentFactoryResolution(t *testing.T) {
	var calls int
	factory := func(*DependencyProvider) (int, error) {
		calls++
		return 7, nil
	}

	provider, err := NewDependencyProvider(ProvideFactory(factory))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var wg sync.WaitGroup
	wg.Add(4)

	for range 4 {
		go func() {
			defer wg.Done()
			value, err := Resolve[int](provider)
			if err != nil {
				t.Errorf("resolve failed: %v", err)
				return
			}

			if value != 7 {
				t.Errorf("unexpected value: %d", value)
			}
		}()
	}

	wg.Wait()

	if calls != 1 {
		t.Fatalf("factory invoked %d times", calls)
	}
}
