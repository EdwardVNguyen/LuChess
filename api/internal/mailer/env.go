package mailer

import (
	"fmt"
	"io"
	"net/mail"
	"strconv"
	"strings"
)

const (
	envMailer       = "MAILER"
	envSMTPHost     = "SMTP_HOST"
	envSMTPPort     = "SMTP_PORT"
	envSMTPUsername = "SMTP_USERNAME"
	envSMTPPassword = "SMTP_PASSWORD"
	envSMTPFrom     = "SMTP_FROM"
)

// FromEnv builds the mailer that MAILER names, reading settings through getenv.
// There is no default: the console mailer sends nothing and prints working
// links to console, so it has to be chosen on purpose, never fallen back to.
func FromEnv(getenv func(string) string, console io.Writer) (Mailer, error) {
	switch choice := getenv(envMailer); choice {
	case "console":
		return Console{Out: console}, nil
	case "smtp":
		return smtpFromEnv(getenv)
	case "":
		return nil, fmt.Errorf(`%s must be set to "smtp" or "console"`, envMailer)
	default:
		return nil, fmt.Errorf(`%s is %q, but must be "smtp" or "console"`, envMailer, choice)
	}
}

func smtpFromEnv(getenv func(string) string) (Mailer, error) {
	var missing []string
	for _, name := range []string{envSMTPHost, envSMTPPort, envSMTPUsername, envSMTPPassword, envSMTPFrom} {
		if strings.TrimSpace(getenv(name)) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("%s=smtp needs %s to be set", envMailer, strings.Join(missing, ", "))
	}

	// The errors below name the setting and never repeat its value
	port, err := strconv.Atoi(strings.TrimSpace(getenv(envSMTPPort)))
	if err != nil || port < 1 || port > 65535 {
		return nil, fmt.Errorf("%s must be a port number from 1 to 65535", envSMTPPort)
	}
	from := strings.TrimSpace(getenv(envSMTPFrom))
	if _, err := mail.ParseAddress(from); err != nil {
		return nil, fmt.Errorf(`%s must be an email address, such as "no-reply@example.com" or "LuChess <no-reply@example.com>"`, envSMTPFrom)
	}
	return SMTP{
		Host:     strings.TrimSpace(getenv(envSMTPHost)),
		Port:     port,
		Username: strings.TrimSpace(getenv(envSMTPUsername)),
		Password: getenv(envSMTPPassword),
		From:     from,
	}, nil
}
