# First run

## 1. Claim the instance

A fresh instance sends every page to the setup screen. It asks for a six-digit
code only the server's log shows, valid 15 minutes:

```bash
docker compose -f compose.prod.yaml logs localassistant | grep "Setup code"
```

Then your email, name and password. That first account is the admin.

## 2. Lay out the house

**House**: add your floors (0 is the ground floor, -1 the basement), then rooms
on each with an icon, and outside ones like the garage, the shed or the terrace.
Each room's page has its settings: name, icon, floor, delete. A device without a
room belongs to the whole house; pick its room in its **Edit** sheet.

## 3. Connect MELCloud

**Devices**, then sign in with the email and password the MELCloud app uses.
Every air-to-air and air-to-water unit on the account appears; **Find new
units** picks up ones added later. See [Mitsubishi heat pumps](mitsubishi).

## 4. Add the blinds

**Devices, Add a blind** asks for a name, the blind's IP address, its device ID
and its local key. Getting the last two takes a few minutes, once: see
[Tuya blinds](tuya-blinds).

## 5. Invite the household

**Admin, Invites** makes a link for each person; with email set up under
**Admin, Email**, it's sent for you. Everyone signed in can drive every device;
only admins add or remove them.
