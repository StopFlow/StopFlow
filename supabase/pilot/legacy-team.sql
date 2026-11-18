-- Classify the already provisioned fictitious employee as approved, without
-- modifying its profile, permissions, membership, password or Auth identity.
BEGIN;
SET LOCAL statement_timeout='5s';
INSERT INTO public.pilot_registration_requests(profile_id,status)
SELECT p.id,'approved' FROM public.profiles p WHERE p.actif AND p.role<>'admin'
AND NOT EXISTS(SELECT FROM public.pilot_registration_requests r WHERE r.profile_id=p.id);
COMMIT;
