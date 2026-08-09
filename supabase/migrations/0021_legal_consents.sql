-- Store the exact legal-document versions accepted during self-serve registration.
alter table tenants
  add column if not exists legal_consents jsonb;

comment on column tenants.legal_consents is
  'Registration consent audit record: accepted_at and terms/privacy/DPA versions.';
