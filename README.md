# v2board-suite

This repository packages the two projects together:

- `v2board-api`
- `v2board-client`

The client keeps its source, docs, and runtime binaries, while generated build output and local node modules stay out of version control.

## Client configuration

The desktop client reads its editable runtime settings from:

- `v2board-client/app.config.json`

Change the app name, version, and backend API URL there, then rebuild the client.

The client build now includes platform-aware paths for macOS and Windows, so `npm run build`
inside `v2board-client/` will package the correct mihomo binary for the current platform.
