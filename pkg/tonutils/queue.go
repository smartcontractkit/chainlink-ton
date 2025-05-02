package tonutils

type Queue[T any] struct {
	queue *[]T
}

func (q *Queue[T]) PushAll(items []T) {
	*q.queue = append(*q.queue, items...)
}

func (q *Queue[T]) Push(item T) {
	*q.queue = append(*q.queue, item)
}

// Pop removes the first item from the queue and returns it. If the queue is
// empty, it returns the zero value of T and false.
func (q *Queue[T]) Pop() (item T, ok bool) {
	if q.IsEmpty() {
		return item, false
	}
	item = (*q.queue)[0]
	if len(*q.queue) == 1 {
		*q.queue = make([]T, 0)
	} else {
		*q.queue = (*q.queue)[1:] // TODO this could be more efficient by using a ring buffer or a linked list
	}
	return item, true
}

func (q *Queue[T]) IsEmpty() bool {
	return len(*q.queue) == 0
}

func NewEmpyQueue[T any]() *Queue[T] {
	newVar := make([]T, 0)
	return &Queue[T]{queue: &newVar}
}

// IN PLACE: This uses the provided slice as the storage. It is used to modify
// a slice as a queue.
func AsQueue[T any](list *[]T) *Queue[T] {
	return &Queue[T]{queue: list}
}
