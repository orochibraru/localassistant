# Introduction

LocalAssistant controls a household's blinds and heat pumps from one page, on a
server you run. It does a few integrations properly instead of thousands
loosely: Tuya blinds over the local network and Mitsubishi Electric heat pumps
through MELCloud.

- **Home** shows every heat pump (room temperature, target, power, mode) and
  every blind (position, open, stop, close, a slider), refreshed every 30
  seconds while it's open.
- **Admin, Devices** connects the MELCloud account and adds blinds.
- A background worker reads every device every two minutes, and re-reads a blind
  30 seconds after a command, once it stopped moving. A device unreachable for
  an hour sends the admins a push notification, once, if they turned
  notifications on under **Account, Notifications**.

It's one container and one SQLite file, installable on phones as an app. See
[Install](install) to run it.
