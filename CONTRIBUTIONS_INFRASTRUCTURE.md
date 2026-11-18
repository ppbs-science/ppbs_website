# PPBS contribution and credit register

This adapts FORRT's Tenzing workflow for PPBS. It keeps one standard contribution sheet per project and one index that tells the website which sheets are public and how to label their contribution area. Country, language, and translation stage are optional project metadata, not the scope of the credit system.

## Data flow

The live working folder is [Contribution Infrastructure (Tenzing)](https://drive.google.com/drive/folders/1new37TgZq2DVjaw2qRQh8PDsR9ePqWiO), directly under PPBS Headquarters. New project sheets belong in its [Project Tenzing Sheets](https://drive.google.com/drive/folders/1XIrzZd3-7gg1Sn02ZGrhePr2UzpdH9Os) subfolder. The clean source sheet is [PPBS Tenzing Automation Source](https://docs.google.com/spreadsheets/d/1KmXZIVZ-1ryld4MlP-xe4CcL2sntuKunMgPLyq-0L4Y).

1. Copy [Template | Tenzing | PPBS](https://docs.google.com/spreadsheets/d/13EjWLYAhYlYxAB-D-R1B5GT6XZ4aHD3ykp7423NXR3o) into `Project Tenzing Sheets` for any PPBS project, not only translations.
2. Ask contributors to complete their names, ORCID, affiliations, and roles. `Public profile?` must be explicitly set to `TRUE` before a row can appear online.
3. Complete the `Project metadata` tab. Set `Public` to `TRUE` only after the project and contributors approve the public record.
4. For automatic folder discovery, give the build service read access and set `PPBS_TENZING_FOLDER_ID=1XIrzZd3-7gg1Sn02ZGrhePr2UzpdH9Os` plus a short-lived `GOOGLE_DRIVE_ACCESS_TOKEN`. The sync discovers every native Google Sheet in that folder; no manually maintained link list is required.
5. Run `npm run sync:contributions`. As a fallback, the `TENZING SHEETS SOURCE` tab can still be used with `PPBS_CONTRIBUTIONS_INDEX_URL` when folder-level credentials are unavailable.
6. Run `npm run build`. The generated page is `_site/contributions.html`.

The sync fails as a unit when an approved project sheet cannot be read or a public record is malformed. It does not silently publish a partial register. Without either folder discovery or an index URL, the build validates and uses the committed `data/contributions.json` cache.

## Public/private boundary

Only these fields reach `data/contributions.json`: name, ORCID, primary affiliation, project name and URL, country, country code, language, translation stage, and selected public roles. Email, secondary affiliation, funding, corresponding-author status, and conflict-of-interest fields remain in the project sheet and are not copied to the website cache.

Country and language describe the project package, not a contributor's nationality, ethnicity, residence, or native language. PPBS should obtain contributor approval before setting either `Public` flag to `TRUE`.

## PPBS-specific roles

The template retains the standard Tenzing/CRediT roles and adds PPBS-specific roles:

- Country adaptation
- Political/context review
- Back-translation
- Mentoring
- Research operations
- Data governance
- Country coordination
- Community engagement

These keep translation visible without collapsing conceptual, contextual, and validation work into a single label.

These extensions cover work that standard CRediT roles do not always describe precisely enough. They apply across PPBS research, infrastructure, mentoring, governance, dissemination, translations, and country adaptations.
