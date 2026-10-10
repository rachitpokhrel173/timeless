/** Emits reference-data SQL (permissions, roles, automation rules) from the TS definitions. */
import { writeFileSync } from "node:fs";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/lib/auth/permissions";
import { DEFAULT_CHECKLISTS, DEFAULT_RULES } from "../src/lib/defaults";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const out = process.argv[2];

let roles = "-- Permissions and built-in roles (keep in sync with src/lib/auth/permissions.ts)\n\n";
roles += "insert into public.permissions (key, group_name, label) values\n";
roles += Object.entries(PERMISSIONS)
  .map(([k, v]) => `  (${q(k)}, ${q(v.group)}, ${q(v.label)})`)
  .join(",\n");
roles += "\non conflict (key) do update set group_name = excluded.group_name, label = excluded.label;\n\n";
roles += "insert into public.roles (key, name, description, is_system) values\n";
roles += DEFAULT_ROLES.map((r) => `  (${q(r.key)}, ${q(r.name)}, ${q(r.description)}, true)`).join(",\n");
roles += "\non conflict (key) do nothing;\n\n";
roles += "insert into public.role_permissions (role_id, permission_key)\nselect r.id, v.permission_key from (values\n";
roles += DEFAULT_ROLES.flatMap((r) => r.permissions.map((p) => `  (${q(r.key)}, ${q(p)})`)).join(",\n");
roles += "\n) as v(role_key, permission_key)\njoin public.roles r on r.key = v.role_key\non conflict do nothing;\n";
writeFileSync(`${out}/00002.roles.sql`, roles);

let rules = "-- Built-in automation rules and checklist templates (switched on/off under System → Automations)\n\n";
rules += "insert into public.automation_rules (key, name, trigger, description, config) values\n";
rules += DEFAULT_RULES.map((r) => `  (${q(r.key)}, ${q(r.name)}, ${q(r.trigger)}, ${q(r.description)}, ${q(JSON.stringify(r.config))}::jsonb)`).join(",\n");
rules += "\non conflict (key) do nothing;\n\n";
rules += "insert into public.checklist_templates (name, phase, items)\nselect v.name, v.phase, v.items from (values\n";
rules += DEFAULT_CHECKLISTS.map((c) => `  (${q(c.name)}, ${q(c.phase)}, array[${c.items.map(q).join(", ")}]::text[])`).join(",\n");
rules += "\n) as v(name, phase, items)\nwhere not exists (select 1 from public.checklist_templates t where t.name = v.name);\n";
writeFileSync(`${out}/00012.rules.sql`, rules);
console.log("ok");
