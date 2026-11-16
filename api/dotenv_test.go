package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Names no real setting uses, so the tests cannot disturb one
const (
	envFromFile        = "LUCHESS_TEST_DOTENV_FROM_FILE"
	envFromEnvironment = "LUCHESS_TEST_DOTENV_FROM_ENVIRONMENT"
)

// writeDotEnv writes a .env file with the given contents to a directory of its own, and returns its path.
func writeDotEnv(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("writing %s: %v", path, err)
	}
	return path
}

// unsetAfter clears a variable the file under test sets, which t.Setenv cannot do for a variable it did not set.
func unsetAfter(t *testing.T, key string) {
	t.Helper()
	os.Unsetenv(key)
	t.Cleanup(func() { os.Unsetenv(key) })
}

func TestAMissingDotEnvFileLeavesTheEnvironmentAsItIs(t *testing.T) {
	t.Setenv(envFromEnvironment, "from the environment")

	if err := loadDotEnv(filepath.Join(t.TempDir(), ".env")); err != nil {
		t.Fatalf("loadDotEnv(missing file) = %v; want nil", err)
	}

	if got := os.Getenv(envFromEnvironment); got != "from the environment" {
		t.Fatalf("%s = %q; want it untouched", envFromEnvironment, got)
	}
}

func TestADotEnvFileIsLoadedIntoTheEnvironment(t *testing.T) {
	unsetAfter(t, envFromFile)
	path := writeDotEnv(t, "# a comment\n"+envFromFile+"=from the file\n")

	if err := loadDotEnv(path); err != nil {
		t.Fatalf("loadDotEnv(valid file) = %v; want nil", err)
	}

	if got := os.Getenv(envFromFile); got != "from the file" {
		t.Fatalf("%s = %q; want %q", envFromFile, got, "from the file")
	}
}

func TestADotEnvFileDoesNotReplaceWhatTheEnvironmentAlreadySets(t *testing.T) {
	t.Setenv(envFromEnvironment, "from the environment")
	path := writeDotEnv(t, envFromEnvironment+"=from the file\n")

	if err := loadDotEnv(path); err != nil {
		t.Fatalf("loadDotEnv(valid file) = %v; want nil", err)
	}

	if got := os.Getenv(envFromEnvironment); got != "from the environment" {
		t.Fatalf("%s = %q; want the environment's value kept", envFromEnvironment, got)
	}
}

func TestADotEnvFileThatCannotBeParsedIsAnError(t *testing.T) {
	unsetAfter(t, envFromFile)
	path := writeDotEnv(t, envFromFile+"=from the file\nthis line is not a setting\n")

	err := loadDotEnv(path)
	if err == nil {
		t.Fatal("loadDotEnv(unparseable file) = nil; want an error")
	}
	// Startup prints this, so it has to say which file is broken
	if !strings.Contains(err.Error(), path) {
		t.Errorf("error %q does not name the file %s", err, path)
	}
	if got, set := os.LookupEnv(envFromFile); set {
		t.Errorf("%s = %q; want nothing loaded from a file that does not parse", envFromFile, got)
	}
}

func TestADotEnvFileThatCannotBeReadIsAnError(t *testing.T) {
	// A directory is there but cannot be read as a file, whoever runs the tests; a file without read permission can be, by root
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatalf("creating %s: %v", path, err)
	}

	if err := loadDotEnv(path); err == nil {
		t.Fatal("loadDotEnv(unreadable file) = nil; want an error")
	}
}
