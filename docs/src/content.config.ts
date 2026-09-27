import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	// UI strings for our own components, next to Starlight's built-in ones.
	i18n: defineCollection({
		loader: i18nLoader(),
		schema: i18nSchema({
			extend: z.object({
				'xr.hero.badge': z.string().optional(),
				'xr.hero.install': z.string().optional(),
				'xr.hero.installHint': z.string().optional(),
				'xr.copy': z.string().optional(),
				'xr.copied': z.string().optional(),
				'xr.diagram.label': z.string().optional(),
				'xr.diagram.serverA': z.string().optional(),
				'xr.diagram.serverB': z.string().optional(),
				'xr.diagram.panel': z.string().optional(),
				'xr.diagram.link': z.string().optional(),
				'xr.diagram.linkSub': z.string().optional(),
				'xr.diagram.you': z.string().optional(),
				'xr.uipath.label': z.string().optional(),
			}),
		}),
	}),
};
