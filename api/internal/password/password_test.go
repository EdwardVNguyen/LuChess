package password_test

import (
	"strings"
	"testing"

	"github.com/EdwardVNguyen/ChessNotes/api/internal/password"
)

var cheap = password.Hasher{MemoryKiB: 8, Iterations: 1, Parallelism: 1, SaltLen: 16, KeyLen: 32}

func TestAHashedPasswordVerifiesOnlyWithTheSamePassword(t *testing.T) {
	hash, err := cheap.Hash("correct horse battery")
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}

	ok, err := password.Verify("correct horse battery", hash)
	if err != nil || !ok {
		t.Fatalf("Verify(right password) = %v, %v; want true, nil", ok, err)
	}
	ok, err = password.Verify("correct horse batterz", hash)
	if err != nil || ok {
		t.Fatalf("Verify(wrong password) = %v, %v; want false, nil", ok, err)
	}
}

func TestHashesOfTheSamePasswordDiffer(t *testing.T) {
	a, _ := cheap.Hash("same password")
	b, _ := cheap.Hash("same password")

	if a == b {
		t.Fatal("two hashes of one password are identical, so the salt is not random")
	}
}

func TestVerifyUsesTheSettingsStoredInTheHash(t *testing.T) {
	hash, _ := password.Hasher{MemoryKiB: 16, Iterations: 2, Parallelism: 1, SaltLen: 16, KeyLen: 32}.Hash("pw for old settings")

	// Verify is a package function, so it cannot be using any Hasher's current settings
	if ok, err := password.Verify("pw for old settings", hash); err != nil || !ok {
		t.Fatalf("Verify = %v, %v; want true, nil", ok, err)
	}
}

func TestVerifyRejectsMalformedHashes(t *testing.T) {
	for _, bad := range []string{"", "plaintext", "$argon2id$", "$bcrypt$v=19$m=8,t=1,p=1$c2FsdA$aGFzaA", "$argon2id$v=19$m=8,t=1,p=1$!!$aGFzaA", strings.Repeat("$", 5)} {
		if ok, err := password.Verify("x", bad); ok || err == nil {
			t.Errorf("Verify(%q) = %v, %v; want false and an error", bad, ok, err)
		}
	}
}

func TestHashRefusesSettingsThatWouldPanicOrWeakenIt(t *testing.T) {
	cases := map[string]password.Hasher{
		"zero value":        {},
		"no iterations":     {MemoryKiB: 8, Iterations: 0, Parallelism: 1, SaltLen: 16, KeyLen: 32},
		"no parallelism":    {MemoryKiB: 8, Iterations: 1, Parallelism: 0, SaltLen: 16, KeyLen: 32},
		"tiny salt":         {MemoryKiB: 8, Iterations: 1, Parallelism: 1, SaltLen: 2, KeyLen: 32},
		"tiny key":          {MemoryKiB: 8, Iterations: 1, Parallelism: 1, SaltLen: 16, KeyLen: 4},
		"too little memory": {MemoryKiB: 4, Iterations: 1, Parallelism: 1, SaltLen: 16, KeyLen: 32},
	}
	for name, h := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := h.Hash("anything"); err == nil {
				t.Fatal("Hash accepted invalid settings")
			}
		})
	}
}
