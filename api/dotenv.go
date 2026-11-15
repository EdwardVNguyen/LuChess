package main

import (
	"errors"
	"fmt"
	"io/fs"

	"github.com/joho/godotenv"
)

// loadDotEnv adds the settings in the file at path to the environment, without replacing any already there.
// A missing file is not an error: in a container there is none, and the settings are already in the environment.
// A file that is there but cannot be read or parsed is one, so a broken file is never silently skipped.
func loadDotEnv(path string) error {
	err := godotenv.Load(path)
	if err == nil || errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return fmt.Errorf("loading %s: %w", path, err)
}
