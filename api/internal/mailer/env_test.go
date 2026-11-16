package mailer

import (
	"bytes"
	"maps"
	"strings"
	"testing"
)

// env answers getenv from a map; anything not in it is unset.
func env(vars map[string]string) func(string) string {
	return func(name string) string { return vars[name] }
}

var smtpEnv = map[string]string{
	"MAILER":        "smtp",
	"SMTP_HOST":     "smtp.example.com",
	"SMTP_PORT":     "587",
	"SMTP_USERNAME": testUsername,
	"SMTP_PASSWORD": testPassword,
	"SMTP_FROM":     "LuChess <no-reply@example.com>",
}

// smtpEnvWith is smtpEnv with some settings replaced; "" unsets one.
func smtpEnvWith(changes map[string]string) func(string) string {
	vars := maps.Clone(smtpEnv)
	maps.Copy(vars, changes)
	return env(vars)
}

func TestMailerMustBeChosen(t *testing.T) {
	for name, vars := range map[string]map[string]string{
		"missing":             {},
		"empty":               {"MAILER": ""},
		"unknown":             {"MAILER": "sendgrid"},
		"wrong case":          {"MAILER": "Console"},
		"missing, SMTP given": {"SMTP_HOST": "smtp.example.com", "SMTP_PORT": "587", "SMTP_USERNAME": testUsername, "SMTP_PASSWORD": testPassword, "SMTP_FROM": "no-reply@example.com"},
	} {
		t.Run(name, func(t *testing.T) {
			m, err := FromEnv(env(vars), &bytes.Buffer{})

			if err == nil {
				t.Fatalf("FromEnv returned %T, want an error", m)
			}
			for _, want := range []string{"MAILER", `"smtp"`, `"console"`} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("error %q does not mention %s", err, want)
				}
			}
		})
	}
}

func TestMailerConsoleWritesToTheGivenWriter(t *testing.T) {
	var out bytes.Buffer

	m, err := FromEnv(env(map[string]string{"MAILER": "console"}), &out)

	if err != nil {
		t.Fatalf("FromEnv: %v", err)
	}
	if _, ok := m.(Console); !ok {
		t.Fatalf("mailer is %T, want the console mailer", m)
	}
	if err := m.Send(t.Context(), verification); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if !strings.Contains(out.String(), "verify-email?token=") {
		t.Fatalf("the console mailer did not print the link:\n%s", out.String())
	}
}

func TestMailerSMTPTakesItsSettingsFromTheEnvironment(t *testing.T) {
	m, err := FromEnv(env(smtpEnv), &bytes.Buffer{})

	if err != nil {
		t.Fatalf("FromEnv: %v", err)
	}
	got, ok := m.(SMTP)
	if !ok {
		t.Fatalf("mailer is %T, want the SMTP mailer", m)
	}
	if got.Host != "smtp.example.com" || got.Port != 587 || got.Username != testUsername ||
		got.Password != testPassword || got.From != "LuChess <no-reply@example.com>" {
		t.Fatalf("SMTP mailer has host %q, port %d, username %q, password %q, sender %q; want the settings given",
			got.Host, got.Port, got.Username, got.Password, got.From)
	}
	// Only tests may change whom the mailer trusts or where it connects
	if got.rootCAs != nil || got.dial != nil {
		t.Fatal("an SMTP mailer from the environment does not use the system's roots and dialer")
	}
}

func TestMailerSMTPNamesEverySettingThatIsMissing(t *testing.T) {
	settings := []string{"SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM"}
	cases := [][]string{{"SMTP_HOST"}, {"SMTP_PORT"}, {"SMTP_USERNAME"}, {"SMTP_PASSWORD"}, {"SMTP_FROM"},
		{"SMTP_USERNAME", "SMTP_PASSWORD"}, settings}
	for _, missing := range cases {
		t.Run(strings.Join(missing, ","), func(t *testing.T) {
			unset := map[string]string{}
			for _, name := range missing {
				unset[name] = ""
			}

			m, err := FromEnv(smtpEnvWith(unset), &bytes.Buffer{})

			if err == nil {
				t.Fatalf("FromEnv returned %T, want an error", m)
			}
			for _, name := range settings {
				_, isMissing := unset[name]
				if named := strings.Contains(err.Error(), name); named != isMissing {
					t.Errorf("error %q: names %s = %t, want %t", err, name, named, isMissing)
				}
			}
		})
	}
}

func TestMailerSMTPRejectsSettingsThatCannotWork(t *testing.T) {
	cases := []struct {
		name     string
		changes  map[string]string
		wantName string
	}{
		{"a port that is not a number", map[string]string{"SMTP_PORT": "submission"}, "SMTP_PORT"},
		{"a port out of range", map[string]string{"SMTP_PORT": "70000"}, "SMTP_PORT"},
		{"a port of zero", map[string]string{"SMTP_PORT": "0"}, "SMTP_PORT"},
		{"a sender that is not an address", map[string]string{"SMTP_FROM": "LuChess"}, "SMTP_FROM"},
		{"a blank host", map[string]string{"SMTP_HOST": "   "}, "SMTP_HOST"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m, err := FromEnv(smtpEnvWith(tc.changes), &bytes.Buffer{})

			if err == nil {
				t.Fatalf("FromEnv returned %T, want an error", m)
			}
			if !strings.Contains(err.Error(), tc.wantName) {
				t.Errorf("error %q does not name %s", err, tc.wantName)
			}
		})
	}
}

func TestMailerErrorsNeverRepeatThePassword(t *testing.T) {
	for _, changes := range []map[string]string{
		{"SMTP_HOST": ""},
		{"SMTP_PORT": "x"},
		{"SMTP_FROM": "x"},
		{"MAILER": "other"},
	} {
		_, err := FromEnv(smtpEnvWith(changes), &bytes.Buffer{})
		if err == nil {
			t.Fatalf("FromEnv accepted %v", changes)
		}
		if strings.Contains(err.Error(), testPassword) || strings.Contains(err.Error(), testUsername) {
			t.Errorf("error %q repeats a credential", err)
		}
	}
}
