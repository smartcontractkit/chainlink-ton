package config

// UseExistingNetwork determines if integration tests should connect to a
// pre-existing network instead of creating a new ephemeral one.
const (
	UseExistingNetwork = false // Default to false, can be set to true for local debugging
	// UseExistingNetwork = true // Default to false, can be set to true for local debugging
)
