---
name: "daily-find-job"
description: "Find related tech job opportunities and add them into a document. Use when the user asks to find jobs related to tech roles. This skill adds to existing document; it does not duplicate nor delete existing jobs."
---

# daily-find-job

## User inputs
The user adds the websites to use, location, years of experience. Ask for specific technology roles before searching for jobs. Treat none added as all technological roles.

## Procedure
1. Read the websites to use, location, years of experience. 
2. Prioritize roles when the user specifies specific role
3. Select role that aligns with user. If no role is specified find roles that is compatible with other added information
4. Add the found roles and check for no duplication or expired roles.

## Output
List the roles in order from most important compatibility to least compatibility

## Boundaries
Do not add personal information that was not sent by me. Do not add resume to any of the jobs nor apply.
