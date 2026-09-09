-- DEVELOPMENT ONLY — never apply to production.
-- Binds the gated dev impersonation personas (docs/DECISIONS.md D-004) to the
-- seeded employees and adds the dev administrator persona. The fixed auth UUIDs
-- match lib/auth/dev.ts.

begin;

update employees set auth_user_id = '00000000-0000-4000-8000-000000000001'
  where employee_code = 'HQ_IPPDD_MJ';
update employees set auth_user_id = '00000000-0000-4000-8000-000000000002'
  where employee_code = 'HQ_IPPDD_LA';
update employees set auth_user_id = '00000000-0000-4000-8000-000000000003'
  where employee_code = 'HQ_IPPDD_OO';

insert into employees (id, auth_user_id, employee_code, email, full_name,
                       department_id, position_title, manager_id, system_role) values
  ('e0000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004',
   'DEV_ADMIN','workos-admin@dev.local','WorkOS Admin (dev)',
   'd0000000-0000-4000-8000-000000000001','System Administrator',null,'ADMIN');

commit;
