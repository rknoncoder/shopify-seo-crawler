import type { SiteProfile } from "../types/report.js";
import { saveJson } from "./saveJson.js";

export function saveSiteProfileJson(profile: SiteProfile, path = "data/raw/site-profile.json"): Promise<string> {
  return saveJson(path, profile);
}
