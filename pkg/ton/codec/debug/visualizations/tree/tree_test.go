package tree

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTreeDescription(t *testing.T) {
	tree := treeNode{
		description: "root",
		children: &[]treeNode{
			{
				description: "branch",
				children: &[]treeNode{
					{
						description: "child1",
					},
					{
						description: "child2",
						children: &[]treeNode{
							{
								description: "grandchild1",
							},
						},
					},
				},
			}, {
				description: "anotherBranch",
			},
		},
	}

	expected := `root
├── branch
│   ├── child1
│   └── child2
│       └── grandchild1
└── anotherBranch`
	assert.Equal(t, expected, tree.ToString())
}
