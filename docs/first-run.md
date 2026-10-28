# First run

## 1. Claim the instance

A fresh instance sends every page to the setup screen. It asks for a six-digit
code only the server's log shows, valid 15 minutes:

```bash
docker compose -f compose.prod.yaml logs localassistant | grep "Setup code"
```

Then your email, name and password. That first account is the admin.

## 2. Connect MELCloud

**Admin, Devices**, then sign in with the email and password the MELCloud app
uses. Every air-to-air and air-to-water unit on the account appears; **Find new
units** picks up ones added later. See [Mitsubishi heat pumps](mitsubishi).

## 3. Add the blinds

**Add a blind** asks for a name, the blind's IP address, its device ID and its
local key. Getting the last two takes a few minutes, once: see
[Tuya blinds](tuya-blinds).

## 4. Invite the household

**Admin, Invites** makes a link for each person; with email set up under
**Admin, Email**, it's sent for you. Everyone signed in can drive every device;
only admins add or remove them.
