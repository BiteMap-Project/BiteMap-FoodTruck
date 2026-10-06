# Operator account screens

## Acceptance criteria

- Operators can register with a display name, email, password, and password confirmation.
- Registration errors appear near the form without exposing or logging passwords.
- A successful registration sends the operator to login and confirms that the account was created.
- Operators can log in with their email and password.
- Opening `/operator` restores the current session through `/api/auth/me`.
- Anonymous visitors to `/operator` are sent to the login screen.
- Operators can log out, which clears the backend session and returns them to login.
- All POST requests fetch and send the backend CSRF token with the same browser session.
- Passwords and session identifiers are never stored in local storage or session storage.
- The screens work at mobile widths and provide accessible labels, status messages, and disabled submit states.

Truck profile and menu management screens are separate work. This step only connects
the frontend to the registration and session APIs from SCRUM-45 and SCRUM-46.
