# CI and releases

## Shipping a change

- Never push to `main`. Branch as `<type>/<what-it-does>`: a Conventional Commit
  type and a meaningful kebab-case summary (`fix/e2e-routines-rename`, not
  `fix/ci-stuff`).
- Open a PR whose title is a Conventional Commit, since the squash merge makes
  it the commit releaser reads, and whose body fills
  `.github/pull_request_template.md`. No Claude session URL or Claude Code link
  in the PR body.
- Watch its CI until `CI Gate` is green and fix what fails.

## Pull requests

- `pull_request.yaml` runs code quality (prek over every file, then the pre-push
  hooks), builds the image on native amd64 and arm64 runners and tags it
  `pr-<number>` on Docker Hub (`docker.io/orochibraru/localassistant`). A PR
  from a fork gets no credentials: its image is built, not pushed.
- A docs-only PR gets the checks but no image. A release PR (`releaser/release`)
  may only touch `CHANGELOG.md` and `package.json`'s version, and builds
  nothing.
- `CI Gate` is the one required check. `pr-title.yaml` enforces a Conventional
  Commit title, which squash merges turn into the commit releaser reads.
- `pr-cleanup.yaml` deletes `pr-<number>` from Docker Hub when a PR closes
  unmerged; Publish deletes it after a merge, once the canary is out.

## Releases

- Every merge to `main` ships a canary: releaser computes `X.Y.Z-canary.N`,
  every commit type bumps. The merged PR's image is retagged when its
  `app.source-tree` label matches the commit's tree (only `APP_VERSION`
  changes), otherwise it's rebuilt. Tags: `X.Y.Z-canary.N` and `canary`.
- releaser keeps a `chore(release): X.Y.Z` PR open. Merging it retags the last
  canary as `X.Y.Z` and `latest`. Nothing is rebuilt.
- Every Publish that releases (canary or stable) pushes `README.md` to the
  Docker Hub description, relative links turned into GitHub URLs, and
  `package.json`'s description as the short one. The `markdown-links` hook keeps
  those links alive.
- Every image, PR, canary and release, lives on Docker Hub only
  (`docker.io/orochibraru/localassistant`). Nothing is pushed to ghcr.io.

## One-time setup

- Secrets: `DOCKER_REGISTRY_PASSWORD` (a Docker Hub access token for
  `orochibraru` with read, write and delete scope: deleting PR tags needs it)
  and `RELEASE_DEPLOY_KEY` (private half of a deploy key with write access,
  bypassing the branch and tag rulesets).
- The Docker Hub repository must be public: self-hosters pull `latest` from it.
- `CI Gate` as the required check, squash merges only.
