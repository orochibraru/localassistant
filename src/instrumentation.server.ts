import "reflect-metadata";

import { configuration } from "#lib/server/core/config.js";
import { environmentConfig } from "#lib/server/core/env.js";

configuration.set(environmentConfig.build());
