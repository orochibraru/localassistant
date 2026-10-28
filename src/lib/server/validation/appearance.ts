import { z } from "zod";

import {
	accents,
	cornerStyles,
	darkVariants,
	fonts,
	themes,
} from "#lib/server/db/schema.js";

export const appearanceSchema = z.object({
	accent: z.enum(accents),
	theme: z.enum(themes),
	darkVariant: z.enum(darkVariants),
	font: z.enum(fonts),
	corners: z.enum(cornerStyles),
});
