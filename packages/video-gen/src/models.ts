import type { CatalogModel } from "./types.js";

/**
 * Static recommended Seedance 2.0 catalog.
 * `--model` remains pass-through for any official Model ID.
 */
export const CATALOG_MODELS: CatalogModel[] = [
  {
    id: "doubao-seedance-2-0-260128",
    name: "Seedance 2.0",
    maxResolution: "1080p/4k",
    notes: "Highest quality; first-class default",
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    name: "Seedance 2.0 Fast",
    maxResolution: "720p",
    notes: "Faster / lower cost",
  },
  {
    id: "doubao-seedance-2-0-mini-260615",
    name: "Seedance 2.0 Mini",
    maxResolution: "720p",
    notes: "Cheapest tier",
  },
];

export const DEFAULT_MODEL_ID = CATALOG_MODELS[0].id;

export function listCatalogModels(): {
  defaultModel: string;
  models: CatalogModel[];
} {
  return {
    defaultModel: DEFAULT_MODEL_ID,
    models: CATALOG_MODELS,
  };
}
