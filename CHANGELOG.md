# Changelog

## [1.0.1](https://github.com/orochibraru/localassistant/compare/v1.0.0...v1.0.1) (2026-10-30)

### ⚠ BREAKING CHANGES

* **admin:** leave database backups to the server ([f64c6ca](https://github.com/orochibraru/localassistant/commit/f64c6cac8f85136dbd1ce828d7fd2ebb53297a3b))
* **devices:** house configuration files are version 2: devices carry fields
and secrets, plugin connections replace the MELCloud account. Version 1 files
are refused.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CfgTQHhVb1nk7FsobwW5c5 ([27f8b3d](https://github.com/orochibraru/localassistant/commit/27f8b3df210a3cae64aa9a695709a75f66adeae9))
* **db:** ESPHome units with web-server auth need their username and
password typed again. Camera recordings now live in <data>/plugin-data/camera/;
move the old <data>/cameras/ folder there by hand.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CfgTQHhVb1nk7FsobwW5c5 ([fa99dc4](https://github.com/orochibraru/localassistant/commit/fa99dc4599fe5d9bc0993129e7b323c0f8baa77a))

### Features

* **climate:** show the room temperature next to the target ([0a10696](https://github.com/orochibraru/localassistant/commit/0a10696d76fc4f82ddd7ba4e0b3bae0c2753434c))
* **devices:** recheck offline devices on navigation and every 30 seconds ([c450f94](https://github.com/orochibraru/localassistant/commit/c450f9477c87e263c1965d4133b278909c8c9539))
* **dreame:** name the robot's errors on its card and notify everyone of new ones ([c000811](https://github.com/orochibraru/localassistant/commit/c0008110f2da14019e28512832cb52aa47ab54ed))
* **admin:** show the MCP server address on Admin, AI ([d835906](https://github.com/orochibraru/localassistant/commit/d83590619674f68b7b547ce518a64decdbcc572e))
* **assistant:** write and manage routines and scenes from the chat ([c96e652](https://github.com/orochibraru/localassistant/commit/c96e652f93ff8a06ca5d9ece30b466652469f415))
* **mcp:** let AI apps create, change, run and delete routines and scenes ([560a98c](https://github.com/orochibraru/localassistant/commit/560a98ce262b009adcb3317245fd4960f29153e5))
* **mobile:** pull to refresh on Home and Routines ([bd11234](https://github.com/orochibraru/localassistant/commit/bd1123422737b400f9717d28d3fbd1382eaee15c))
* **ui:** pull to refresh on phones ([45b6851](https://github.com/orochibraru/localassistant/commit/45b68517ed8eb86add2f219016ace03c493b3b23))
* **plugins:** add url fields checked by zod and DNS, and encrypted headers fields ([45fa2f6](https://github.com/orochibraru/localassistant/commit/45fa2f662aeb89ee2e260a2a62a042dccfd6637f))
* **plugins:** reach Frigate and Home Assistant behind a proxy with extra headers ([23310e2](https://github.com/orochibraru/localassistant/commit/23310e25ee4e2eb848cf332c6f076db10d3910a5))
* **sdk:** read headers fields in the Go and Python SDKs ([d53ae63](https://github.com/orochibraru/localassistant/commit/d53ae635ff1a94fe7ca51925c8ee3b674796c9ba))
* **mobile:** add home, device controls, routines, assistant and settings screens ([50eee41](https://github.com/orochibraru/localassistant/commit/50eee41e58199ef922a7db3c9b2b819731f3995d))
* **mobile:** sign in with PKCE or a pairing code and talk to /api/v1 ([79dbebd](https://github.com/orochibraru/localassistant/commit/79dbebdcf49784503e24fb280d60c888dad873a3))
* **assistant:** render replies as Markdown in a bordered bubble ([0afb7fe](https://github.com/orochibraru/localassistant/commit/0afb7fec77f3f59ac2783578a2823af69d581634))
* **api:** add the JSON API the native app reads and drives the house with ([b923d3e](https://github.com/orochibraru/localassistant/commit/b923d3e5f833500c55838f00c6a7946726967afb))
* **auth:** sign the native app in with PKCE or a pairing QR code ([f6be993](https://github.com/orochibraru/localassistant/commit/f6be99357b077789187820f9615be865e7458f57))
* **mcp:** let AI apps list and set scenes ([67ed464](https://github.com/orochibraru/localassistant/commit/67ed46425b89b7b5ec58467a927657d247a18364))
* **assistant:** make the chat a full-screen page with inline thinking and errors ([db6547b](https://github.com/orochibraru/localassistant/commit/db6547bc02aeb3106213fb12d720f6a1050a54e8))
* **admin:** show the server's health on the overview ([b55afeb](https://github.com/orochibraru/localassistant/commit/b55afebf761958d72d02b759679c2a2e56044729))
* **updates:** check GitHub daily and tell admins when a release is out ([f4f8ec1](https://github.com/orochibraru/localassistant/commit/f4f8ec17fa81f3d8e5ec5a8ad099c90ea4e738d5))
* **backups:** copy the database every day and let admins download it ([7538978](https://github.com/orochibraru/localassistant/commit/75389788826aa0b2c7025c8a10f75b99a39b81a1))
* **admin:** add an AI tab for the assistant's key and what AI can see ([70c6b5b](https://github.com/orochibraru/localassistant/commit/70c6b5b7115694ccc6e16ddb34e7036497c4f133))
* **assistant:** add a Claude-powered chat that reads the house and drives it ([b9797bb](https://github.com/orochibraru/localassistant/commit/b9797bb753303a1b932fb158680a6fa284aa1f6d))
* **ai:** let admins hide devices from AI apps ([b1d4c02](https://github.com/orochibraru/localassistant/commit/b1d4c021d6fe340f064549f6be7565ac936c9ca0))
* **notifications:** let each person set their own tell-me-when alerts ([6639ec8](https://github.com/orochibraru/localassistant/commit/6639ec876cc2c028c4639dc88b2d53da2c81d852))
* **routines:** add a step that sends a notification ([d4c09fb](https://github.com/orochibraru/localassistant/commit/d4c09fbde00a3323e0f625929220c40f2be1e5a2))
* **notifications:** let a push carry buttons that set a scene ([be49ff6](https://github.com/orochibraru/localassistant/commit/be49ff6867c09d032de910116cf6110f836b2896))
* **home:** link your dashboards from Home ([0d1a1aa](https://github.com/orochibraru/localassistant/commit/0d1a1aad3ccfdce924402e1bed8d5c774ce45c5a))
* **dashboards:** let everyone make dashboards of their own ([1785579](https://github.com/orochibraru/localassistant/commit/178557925689ff7e03f907142cc2c56f15d697a2))
* **logbook:** add a Logbook page ([517b37f](https://github.com/orochibraru/localassistant/commit/517b37f7d87ae188706fa33611ada56439d0e4e5))
* **devices:** graph a device's history and its latest logbook lines in its menu ([45112a4](https://github.com/orochibraru/localassistant/commit/45112a421b99aa411c86f7a5344df80f6eada85c))
* **history:** keep 30 days of device readings and a logbook of what changed ([880cf21](https://github.com/orochibraru/localassistant/commit/880cf21d42b0cf16a2379fbbf37e15bc6b89d899))
* **home:** show who's home on Home ([91ba938](https://github.com/orochibraru/localassistant/commit/91ba938b73be0166d4b74bd6c5ce68dedad9fa6f))
* **routines:** trigger on arrivals and departures and check who's home ([cd1ad3f](https://github.com/orochibraru/localassistant/commit/cd1ad3f4c79ecd32aaf4037cf177bc2efb2bc4b0))
* **presence:** work out who's home from the trackers and phones each person owns ([fac6510](https://github.com/orochibraru/localassistant/commit/fac65104442c998ca00ba85d56732dff3d3d0390))
* **plugins:** bring person trackers in from MQTT discovery and Home Assistant ([7d46119](https://github.com/orochibraru/localassistant/commit/7d4611920b9e7b30b0e5f81183244c0c4cf7f671))
* **devices:** add a presence card for person trackers ([02162b3](https://github.com/orochibraru/localassistant/commit/02162b3cc66581d9bb904472f8c3c972752e90e6))
* **routines:** split Routines into routines, scenes and history tabs ([d43828f](https://github.com/orochibraru/localassistant/commit/d43828f989075affaf1049e62ef9b71540df7110))
* **routines:** edit conditions, device steps and waits in the routine sheet ([bb7d12b](https://github.com/orochibraru/localassistant/commit/bb7d12b256b9fa1c5599d8cd2de8f8ed10ff5e9f))
* **routines:** add conditions, device triggers, waits, scenes and run history to the engine ([96c82b6](https://github.com/orochibraru/localassistant/commit/96c82b697f3071d17ae882aa62f6c90d59241217))
* **mcp:** let AI apps drive switches, lights, locks, fans, speakers and buttons ([b84e119](https://github.com/orochibraru/localassistant/commit/b84e119ed8f9e5f4c90b0b014e99c8b327d28db9))
* **plugins:** add Zigbee2MQTT lights and locks ([53a98df](https://github.com/orochibraru/localassistant/commit/53a98df238e070d467caadd9bf4768a992c5da68))
* **plugins:** map Home Assistant lights, locks, fans, media players, sensors and scenes ([264d0a4](https://github.com/orochibraru/localassistant/commit/264d0a47b57f250d8de6ee8de615788a5a6ba6d3))
* **plugins:** bring lights, locks, fans, buttons and sensors in through MQTT discovery ([525ead1](https://github.com/orochibraru/localassistant/commit/525ead14715296801af559ac96bb1d239b673415))
* **devices:** show lights, locks, fans, speakers, sensors and buttons on their own cards ([a3e46bb](https://github.com/orochibraru/localassistant/commit/a3e46bb8a002f0ba1ea5fae6bfd3ad05760350f7))
* **devices:** add light, lock, fan, media, sensor and button states and commands ([90a3e17](https://github.com/orochibraru/localassistant/commit/90a3e1778d62c486b4c3e867c3c5815054c95a40))
* **admin:** keep one access token per site and show where each integration comes from ([38ba997](https://github.com/orochibraru/localassistant/commit/38ba997d3f379c26ae7340289d9f9f6502481883))
* **plugins:** install integrations from GitLab, Gitea, Forgejo and folders on the server ([e3851e6](https://github.com/orochibraru/localassistant/commit/e3851e6df372bfd2403f1f703511451c66d3dabe))
* **plugins:** reach private integrations with a saved GitHub token ([5f609d7](https://github.com/orochibraru/localassistant/commit/5f609d7f7e7ee706afb34d9da2c722ac900d3597))
* **plugins:** bridge a Home Assistant instance's entities over its WebSocket API ([81f0440](https://github.com/orochibraru/localassistant/commit/81f04400c78c1ed9c84a48ad969ab202895df521))
* **plugins:** import devices that announce themselves through MQTT discovery ([f7002dc](https://github.com/orochibraru/localassistant/commit/f7002dc816eb9b8c8422acaeced1fd84cbc5de51))
* **sdk:** add TypeScript, Go and Python plugin SDKs with examples ([8d8d0cf](https://github.com/orochibraru/localassistant/commit/8d8d0cfe434ac1dfcd502b9f763c33432d250ce9))
* **admin:** add an Integrations tab to install plugins from a GitHub link ([b8721cd](https://github.com/orochibraru/localassistant/commit/b8721cd959e7cf3b6944812c7e2122c9bb085d06))
* **devices:** build setup sheets from plugin manifests and serve media through one route ([38363aa](https://github.com/orochibraru/localassistant/commit/38363aadd148bf636a48c6e24d080c0c6f2404fc))
* **plugins:** run plugins in a registry with GitHub installs, updates and maintenance checks ([fbe906b](https://github.com/orochibraru/localassistant/commit/fbe906bb4798700acc032c836f07ee484682186a))
* **db:** add the plugin table and move device secrets and fields to JSON columns ([fa99dc4](https://github.com/orochibraru/localassistant/commit/fa99dc4599fe5d9bc0993129e7b323c0f8baa77a))
* **plugins:** define the plugin contract, manifest schema and kind catalog ([fa1497e](https://github.com/orochibraru/localassistant/commit/fa1497e762d0439325a27f3a84782fb1d41e143b))

### Bug Fixes

* **ui:** keep every responsive grid within the screen on phones ([26137b5](https://github.com/orochibraru/localassistant/commit/26137b5ad3dc30a3146aefa8bcc24e7256868b8e))
* **ui:** keep a dialog's content from widening it and scrolling sideways ([fca464c](https://github.com/orochibraru/localassistant/commit/fca464ce42a95037421b39ba8e7d192e79c7f6a1))
* **ui:** drag drawers closed from their content, and keep taps above them closing ([2af4a34](https://github.com/orochibraru/localassistant/commit/2af4a34e420546262ab17aa676a3fce159e5c651))
* **ui:** let drawers drag closed over a scrolled page ([1b127a9](https://github.com/orochibraru/localassistant/commit/1b127a9f94100f56b0dcf90f06213f8a3904df0c))
* **ai:** tell people AI apps can manage routines and scenes ([d779a2b](https://github.com/orochibraru/localassistant/commit/d779a2b4dac28c55b15a57f4112987cf07afd5f8))
* **admin:** drop the floating invite button on phones ([98b1f7f](https://github.com/orochibraru/localassistant/commit/98b1f7fd063191bb65387845b92c3b0a76281e49))
* **ui:** no autocapitalize or autocorrect on addresses, emails and passwords ([b4ae477](https://github.com/orochibraru/localassistant/commit/b4ae477c870d76cbe3e60108fd7b8c7bad4523c2))
* **house:** give the location drawer a pinned Save button and visible search states ([d855789](https://github.com/orochibraru/localassistant/commit/d855789bd672e47f7eaf25aca64b1246f6149796))
* **ui:** keep the homes page within a phone's width, so drawers stay on screen ([3045750](https://github.com/orochibraru/localassistant/commit/30457509994567ecdff23036592a06f2ccbb47c9))
* **ui:** show a label under icon-only choices on phones ([f405ecb](https://github.com/orochibraru/localassistant/commit/f405ecbd99e660fb80fc990ae8cb1f36084787c5))
* **routines:** name the routine or scene in its saved toast ([2878ecf](https://github.com/orochibraru/localassistant/commit/2878ecfedff517a09672cb277c3efbf69ef0eb7d))
* **screenshots:** seed routines with conditions and shoot the routines tab ([b29f0c5](https://github.com/orochibraru/localassistant/commit/b29f0c54f602a8f51eb4207533e92524264bcdb6))
* **server:** accept remote calls over plain HTTP without a proxy ([ec37d05](https://github.com/orochibraru/localassistant/commit/ec37d058b7f8511d7d03ef22e1d219cc5de0914e))
* **email:** send the test email at once and explain SMTP refusals ([0341925](https://github.com/orochibraru/localassistant/commit/03419250911557b4c64c26254a63b3a9edfbc0da))

### Documentation

* **dreame:** document error names and notifications ([36af78f](https://github.com/orochibraru/localassistant/commit/36af78fc8b0bc90835e95a5c1d6ee360e5d278c4))
* AI apps and the assistant manage routines and scenes ([544fd65](https://github.com/orochibraru/localassistant/commit/544fd65f808397cc78cdeddc896e839d90e342b4))
* document url and headers fields and reaching services behind a proxy ([1db3954](https://github.com/orochibraru/localassistant/commit/1db39545181d4a11bcd3509716af5b6d62691e65))
* **mobile:** document the native app, its sign-in and API ([341b519](https://github.com/orochibraru/localassistant/commit/341b51951a95388caea156e6dec06e461fdb1423))
* drop in-app backups from the feature list ([fc9089e](https://github.com/orochibraru/localassistant/commit/fc9089ea6b7238ab34e676c003ecdcf13136d761))
* **maintenance:** document backups, restore, health and updates ([e423d3a](https://github.com/orochibraru/localassistant/commit/e423d3ade48e134ba79ed8f5b4425d59f94adbdd))
* **ai:** document the assistant and device visibility ([8bcb6ff](https://github.com/orochibraru/localassistant/commit/8bcb6ff96dff9bc8a336521974195008ee85b0b7))
* **notifications:** document alerts, notify steps and their buttons ([ef4889c](https://github.com/orochibraru/localassistant/commit/ef4889c0bcdffa4ad65dbde2fce0e9ec5fb1e3ee))
* **dashboards:** document personal dashboards ([5bf9999](https://github.com/orochibraru/localassistant/commit/5bf999951881337ea477944a515455965a866d32))
* **history:** document device history and the logbook ([21d9ba4](https://github.com/orochibraru/localassistant/commit/21d9ba4d925638ff1be0ade5424436db9e0663fe))
* **presence:** explain who's home, trackers and the phone's limits ([9f64cd7](https://github.com/orochibraru/localassistant/commit/9f64cd79948bbb977e15d8624d5bf497dc528082))
* **routines:** document conditions, device triggers, waits, scenes and history ([897aca0](https://github.com/orochibraru/localassistant/commit/897aca0abc1808d5e4c2c1a813bae91db0005dcf))
* **plugins:** document the new cards and what Home Assistant devices come in ([79091fe](https://github.com/orochibraru/localassistant/commit/79091fe766d3e6f8bcbcfdb0bda42e8c3db6bd4d))
* **integrations:** explain GitLab, Gitea and Forgejo sources, per-site tokens and folder installs ([f8c4c9c](https://github.com/orochibraru/localassistant/commit/f8c4c9c0184854efa9d53231b206edeb3de2319f))
* **integrations:** explain how to add a private integration ([ad5ec33](https://github.com/orochibraru/localassistant/commit/ad5ec33a059e5a0b5530acdf61660b1f17dfec88))
* document integrations, writing plugins and the Home Assistant ecosystem ([637263a](https://github.com/orochibraru/localassistant/commit/637263a7ea248f6c5a8314be476fc03bd2d17a4b))
* **env:** say JSON logs are opt-in ([78b0a49](https://github.com/orochibraru/localassistant/commit/78b0a490e08b524f387f28183d04c9a68431d761))

### Code Refactoring

* **automations:** save routines and scenes through one shared service ([568d106](https://github.com/orochibraru/localassistant/commit/568d106c00fbb3e9a4afe5ed095f98bf99489cfe))
* **assistant:** map Claude API failures to HTTP errors in the service ([0a72ede](https://github.com/orochibraru/localassistant/commit/0a72edefdd7b290189feb487d87709a10f2f394e))
* **admin:** leave database backups to the server ([f64c6ca](https://github.com/orochibraru/localassistant/commit/f64c6cac8f85136dbd1ce828d7fd2ebb53297a3b))
* **scenes:** share the button that sets a scene ([6ab74a5](https://github.com/orochibraru/localassistant/commit/6ab74a52908daecfbb8d54f0942dc5dfa5b85e00))
* **devices:** pick routines, energy, MCP and house config by card, not kind ([27f8b3d](https://github.com/orochibraru/localassistant/commit/27f8b3df210a3cae64aa9a695709a75f66adeae9))
* **integrations:** turn the ten official integrations into plugins ([57f3220](https://github.com/orochibraru/localassistant/commit/57f3220b046bb7f5950efe16cf8174c9e6a86eb8))

## 1.0.0 (2026-10-29)

### Features

* arrange device cards, Linky details on its card, plan export, a phone tab bar with a More drawer, automations renamed routines ([181dcf6](https://github.com/orochibraru/localassistant/commit/181dcf6954c4d134a5368fd2617b5ef58b81c318))
* arrange device cards, Linky details on its card, export the plan as PNG, SVG or a LocalAssistant file with plans and pins ([9823b8e](https://github.com/orochibraru/localassistant/commit/9823b8e1e0560a6c304b353b9de73de0fec75b83))
* resizable device cards, Dreame vacuum settings and maintenance, a drawn house plan with pins, shapes and staircases, door or window automations with presets, energy periods, seasons, stats and charts, Linky on the new Conso API ([9f234b5](https://github.com/orochibraru/localassistant/commit/9f234b5761c2bc7549a9adfa2734ff6f7d124cba))
* resizable device cards, Dreame vacuum settings and maintenance, a drawn house plan with pins, shapes and staircases, door or window automations with presets, energy periods and stats, Linky on the new Conso API ([d2fb997](https://github.com/orochibraru/localassistant/commit/d2fb9971fbf9dba13b26300da9d10f7713ac68ff))
* weather, phones as devices, Dreame, automations with presets, Zigbee2MQTT and Shelly, energy charts, Linky online, cameras with recording, Frigate, printer camera, ESPHome CN105 and a wall panel ([ea64d10](https://github.com/orochibraru/localassistant/commit/ea64d10afbe17091061626421768e24ab6be5ceb))
* opt-in multiple homes, JSON configuration import and export, rooms unique per floor, more room icons, fix clearing settings ([d0b5e82](https://github.com/orochibraru/localassistant/commit/d0b5e8269004dd939ba637e66e4120defc288fd4))
* base ([680627c](https://github.com/orochibraru/localassistant/commit/680627cf633c3be1e229c694da3b30e7fb1c55e2))

### Bug Fixes

* update the routines e2e test and show the compose file inline (#1) ([0b14102](https://github.com/orochibraru/localassistant/commit/0b14102813be2d5794f06bd91b0179955970c1d7))
* show Dreame's own reason when an API call is refused ([def89f7](https://github.com/orochibraru/localassistant/commit/def89f7525fcdbdb16c41cfa58196c35d85707ab))
* crash opening an integration from a device's settings, keep password managers off non-credential fields ([b5efaa9](https://github.com/orochibraru/localassistant/commit/b5efaa93ab168fbaf9bf6b45bbcf4c8a0dea0697))
