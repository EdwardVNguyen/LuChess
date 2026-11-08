# Logout waits for the server to confirm

Logging out calls the server first and ends the local Session only after the server answers successfully. If the call fails, the Session stays authenticated and the user can retry. We chose this over local-first logout, which ends the Session immediately and tells the server afterwards, because the simpler rule — the client believes the server — is easier to reason about, and v1 has no reason to optimise logout latency. The cost is explicit: an offline user cannot log out locally and stays logged in until the server can be told. A refresh that resolves after a successful logout is discarded by the Session module's generation guard, so it cannot resurrect the Session.

## Consequences

The alert shown when logout fails now means the Session is still active, so its copy reads "Could not end your session. Check your connection and try again." Every transition to Guest — a successful logout or a 401 during refresh — clears session-scoped query data in one place.
