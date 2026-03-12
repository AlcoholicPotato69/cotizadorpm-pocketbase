--
-- PostgreSQL database dump
--

\restrict 6LZhiGz8nyygT2UtCG8GU35UrU9ebh2VyKWQMPPfgNX3dNJInlKxg43JPdrEf7j

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE auth.audit_log_entries DISABLE TRIGGER ALL;

INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'db6843a8-964f-416a-8bfc-bbd000735c84', '{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"admin@cotizador.com","user_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","user_phone":""}}', '2026-02-14 21:12:20.652115+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '73d7fab6-e888-46f4-9d9f-2482150766df', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-14 21:12:27.187437+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '614e7993-519d-49f2-9e1c-37fd5838d3fe', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-15 09:23:27.673824+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '599e31c8-b101-4d6e-af93-86369e1fd02b', '{"action":"logout","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account"}', '2026-02-15 09:25:26.397374+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '9c3f762a-4d24-4c18-a524-92bca734c98b', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-15 09:25:32.72583+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'b2b53055-b6a4-447c-8b5f-125cc4d0872d', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-16 17:48:25.259297+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'ec30c267-98fe-4f22-880a-474e64010f2a', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-16 18:47:41.769562+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '1972f5f4-2979-44f8-8b8e-61139b542713', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-16 18:47:41.782281+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'b70e56d2-42be-43bd-86a1-e1bf1b789c3d', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-16 19:46:47.504717+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '390d805f-747e-4439-9e46-c9712841a670', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-16 19:46:47.506475+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a4da7124-c27c-4e03-9f5d-fd5bc0538560', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-16 20:48:14.347207+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '0f03e768-f077-4b4d-9f60-7eb4a358a9e4', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-16 20:48:14.349412+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e62889f0-7a9e-4fb6-a891-b50800abdcd9', '{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"admin@plazamayor.com","user_id":"9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0","user_phone":""}}', '2026-02-16 21:40:39.263787+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a5469f03-4ad3-492d-a8e6-901ff9356972', '{"action":"logout","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account"}', '2026-02-16 21:40:44.713231+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '964d2aa0-7039-4b93-8339-9b471edb30ff', '{"action":"login","actor_id":"9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0","actor_username":"admin@plazamayor.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-16 21:41:00.318538+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'ee7d8190-5c92-4d7f-9fb1-928f84014765', '{"action":"logout","actor_id":"9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0","actor_username":"admin@plazamayor.com","actor_via_sso":false,"log_type":"account"}', '2026-02-16 21:41:29.124333+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'bacc6d66-fb25-46a9-9401-8dee4199ca95', '{"action":"login","actor_id":"9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0","actor_username":"admin@plazamayor.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-16 22:22:28.226584+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '5f93f494-eec7-469a-9616-c4adaef3b3ef', '{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"admin@casadepiedra.com","user_id":"1b099fcd-164b-49dc-af4a-c64f4b16961d","user_phone":""}}', '2026-02-16 22:36:58.19672+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '7b800c0d-48a5-40eb-b9af-b55eadd28237', '{"action":"logout","actor_id":"9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0","actor_username":"admin@plazamayor.com","actor_via_sso":false,"log_type":"account"}', '2026-02-16 22:38:31.342051+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e347fb7d-2517-4534-b6ec-d6180432d94b', '{"action":"login","actor_id":"1b099fcd-164b-49dc-af4a-c64f4b16961d","actor_username":"admin@casadepiedra.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-16 22:38:42.289287+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '80ed6f46-b954-4951-b3c5-63b9ae7a655d', '{"action":"logout","actor_id":"1b099fcd-164b-49dc-af4a-c64f4b16961d","actor_username":"admin@casadepiedra.com","actor_via_sso":false,"log_type":"account"}', '2026-02-16 22:47:45.148694+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e48a2c57-d379-4e57-b4c5-7c9ccb89bd28', '{"action":"login","actor_id":"9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0","actor_username":"admin@plazamayor.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-16 22:47:49.790493+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '4535226c-6250-4da4-93b8-e2b6fa7e0b24', '{"action":"logout","actor_id":"9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0","actor_username":"admin@plazamayor.com","actor_via_sso":false,"log_type":"account"}', '2026-02-16 22:50:11.154903+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'd2517421-efeb-48b1-b6ca-33df234580ab', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-16 22:50:17.09513+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f3f61fbd-d1f3-4ca1-a4e2-87cdc1de5bd2', '{"action":"logout","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account"}', '2026-02-16 22:52:07.671066+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '498b44c7-1c86-4ac5-ae42-badf1f1c8d4d', '{"action":"login","actor_id":"1b099fcd-164b-49dc-af4a-c64f4b16961d","actor_username":"admin@casadepiedra.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-16 22:52:12.699237+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '9c96b49d-4fd7-4bf0-af2e-43191ec20a06', '{"action":"logout","actor_id":"1b099fcd-164b-49dc-af4a-c64f4b16961d","actor_username":"admin@casadepiedra.com","actor_via_sso":false,"log_type":"account"}', '2026-02-16 23:06:20.693904+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '30b6100d-f11e-45c8-b449-e9b7e355a5e7', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-16 23:06:27.59878+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '3af32257-ee20-44a7-a4c3-328e74ce48d7', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-18 21:16:33.343211+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '9235b95e-324e-4e2c-9bba-25d6cd23c0a7', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-18 21:16:33.352483+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '7d1b3840-739e-4332-853d-9a124793cada', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 19:31:28.918596+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '47ef23ab-e769-4766-947b-789971cbd5c6', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 19:31:28.971339+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a4bb6a4c-c191-4646-9b9b-cb537c3cf2ed', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 20:30:56.098577+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '7336b6b6-3424-425d-baa2-3cd3998f60f5', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 20:30:56.100229+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'ab429c1c-a181-4e37-9243-92ad03550421', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 21:29:29.404434+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '9bec2f00-b159-4477-90c4-d5ee8d693f21', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 21:29:29.406628+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '9041cab9-2e20-4dd6-9669-d909cf135499', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 22:27:31.491789+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f82cef7d-9bba-4919-9ce2-9a3a066876c9', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 22:27:31.496447+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '8cf92781-a388-4cc3-81d0-f994aa948619', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 23:26:11.158636+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f3a68fef-f236-4b87-861b-1934df8086fa', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-19 23:26:11.168536+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '9e1d56b5-4d40-4a75-b077-d5b4394dc4cb', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-20 00:25:05.879758+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '24afebc8-c04f-4221-a423-253605f12951', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-20 00:25:05.887009+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'b4ccd5ad-3077-4c41-898a-2e14d9af2de6', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-20 19:23:03.005598+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '73687178-ed8a-4ef7-b7e4-40a82030a1b9', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-20 19:23:03.007889+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '5dc668bc-28f3-4ab3-8107-196130fbf65f', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-20 20:21:08.611298+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e8e66ca9-cbbf-4034-b024-82d37c435eb3', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-20 20:21:08.611953+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '7bdf60ab-03e3-4d41-8e31-10c94756adda', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-20 21:42:23.566579+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '68ec64cf-6d9e-4536-9c02-4997766daad4', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-20 21:42:23.568087+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '861b1f14-ddd4-4fc6-8ebe-b5b71e87b421', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-21 19:22:57.419163+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '853fea13-8dce-4d27-b1dd-0fe6ae6c45f0', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-21 19:22:57.421626+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'c6842629-82f3-4348-8a19-4ce543147691', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-21 21:49:55.309633+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '4f59f89f-23d1-487b-92c0-ac533894632c', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-21 21:49:55.312355+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '26405c01-fe24-47ac-afd3-50ca9bee9e32', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-21 22:48:11.458505+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f242cd63-82c4-43cf-9aa6-01d3e8d4ece2', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-21 22:48:11.483556+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '830e3cdb-9762-42b8-a029-e9020dcc074f', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-21 23:47:55.886651+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e40cd795-66fb-481e-8bec-fe6e381ac5cf', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-21 23:47:55.888041+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '936d38e3-0ae7-477c-8c1b-3b9aca566b73', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-22 00:47:12.948775+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f58d54fd-9d21-4847-9069-d4d2a60420a1', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-22 00:47:12.952031+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '80a0c37e-a181-41dc-a922-0083617feacd', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-22 01:45:25.372304+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e324005d-a3da-4745-b9e1-dc1c7ef84318', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-22 01:45:25.375256+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f819ae97-667c-415e-8b4f-a55bcf26b4c4', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-22 21:58:23.081556+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '0f57f046-b360-4acf-a5a2-2d8f56705ad1', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-22 21:58:23.086359+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '2c8778d4-7e3a-4558-9342-b2124ed00dd3', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 13:19:07.493238+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'd2629cea-6f23-4230-9657-060009bf665f', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 13:19:07.501049+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '30c38f9f-000d-48e2-b433-ace7b8bd435b', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 18:00:31.843102+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'abf840a7-1de3-4466-934f-0d94a4a52c56', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 18:00:31.847995+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f99f78f5-13c5-47f4-b024-a835301c87a4', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 18:59:37.392884+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'ee214c7a-56d6-4f71-a047-454465b41dfc', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 18:59:37.401088+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '57fb6585-682b-4bf4-b57f-4b0ff19bb5b9', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 20:06:02.792959+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e3e77a52-0a26-477b-874a-3c195c997c8a', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 20:06:02.80332+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '43c9b2f3-86aa-4863-8a39-7d0499f33703', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-23 20:40:00.5096+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '53586372-a5ea-45b0-a03c-825ce7a649d2', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 21:10:39.910032+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '248ab7aa-feba-406a-a90b-ed0985d7c6d2', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 21:10:39.913367+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f55abe3e-709b-47e7-ab53-31d558a6bc2a', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 22:09:59.004148+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a06c8313-01ef-450a-8798-86baf493bb8f', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 22:09:59.008765+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'b1a8e578-30df-403e-bc94-8266f606a962', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 23:12:46.23137+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '63acab19-7072-4371-8c3c-4e3fd01d9415', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-23 23:12:46.232829+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'd32c94da-e3ad-4b7c-a9e6-c480b935d909', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-24 00:11:25.892707+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '645d65f7-1413-47a4-829e-a96b899330b4', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-24 00:11:25.89382+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '8b4bb3f3-721c-40d9-8e2c-e047cdba497b', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-26 19:26:58.661406+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '002de203-eb87-48d6-b7ec-deaf5d25aba0', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-02-27 20:36:26.760685+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '8e7369d2-7a6d-4405-86e4-89babbb9af20', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-27 22:40:18.824078+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '53301a9a-36d6-4224-b062-7ec3bcf0e265', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-27 22:40:18.82804+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'fa683f07-c28a-4b3a-b671-821a82b5cae8', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-27 23:39:11.596371+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '82f2a4aa-92fc-43d7-bc5c-7e142ed842b3', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-27 23:39:11.60373+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '20d22d6a-e124-41ec-8dde-3458870dd574', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 00:37:20.281791+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '8d907365-29a2-465c-b961-f0fcb37a7e70', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 00:37:20.283273+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'd885fe92-0831-4756-a2b1-e664381d5f63', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 01:36:46.301923+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e9333d96-399b-4126-964b-83fa60aed668', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 01:36:46.304066+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '1fd5ee9c-4662-4154-9aea-1ee97e7ea299', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 02:36:07.849023+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a62026df-64b0-4bad-8516-ecda8552c18e', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 02:36:07.85588+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '506fb2a3-4338-47f0-afce-19f981397661', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 19:24:26.293932+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'd73a5bc5-ea79-4f2b-8cbd-98b97a9388e3', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 19:24:26.302038+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'bc89a715-abee-4fd3-89ca-66dbce84f9ea', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 20:14:34.892197+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a5fe2b37-d015-4868-8f73-b92da9684fde', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 20:14:34.896095+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'c2a6c675-ea89-4390-83e4-3a2e91a57a7f', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 21:14:23.609941+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '7655e73c-cc80-4c54-a327-6a4bf6ff620d', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 21:14:23.615544+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '5ed40312-2151-489f-a990-d5448b567a1a', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 22:14:42.448598+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'c7cc80e1-00f4-40d0-ab8c-f69f75e22049', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-02-28 22:14:42.455479+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '73dcf990-810d-44e5-8a9d-62a97460c520', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 02:16:05.422613+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a2db6e48-e432-4f33-9678-80b2067daec7', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 02:16:05.424509+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'd76e6b6c-c5e4-4701-b994-0e6513314f89', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 07:08:54.605874+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a802e1bb-e805-4b88-ba04-8310037a769b', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 07:08:54.607402+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '745fe4c8-3d60-4f0c-b15d-b7d2bfe1112d', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 16:51:41.146143+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a8ca80f1-71a1-4d73-a6d2-22864956298e', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 16:51:41.153789+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e93e5774-5cd2-4870-986f-2a45ea56041e', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 19:22:11.058081+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '48b8c8a3-885c-4715-9e20-e4a7a1e5dcee', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 19:22:11.063302+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'eaeab4a6-3a5d-49d4-bc66-c1e620fc5462', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 20:22:15.051067+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a58c4184-e4fd-4ccc-948f-020ff8a9624a', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 20:22:15.052621+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '28adfbf2-a599-4575-944e-322df94df5e2', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 21:21:01.116007+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '8487c4a7-ef69-46c1-bc50-f794bfccecf1', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 21:21:01.117212+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '0f94aa3b-a01d-4834-9faf-7e68f4a3b272', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 23:24:08.214651+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '837f28c4-4b4f-4427-a450-9259daae095b', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-01 23:24:08.216014+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '39093fbb-739c-4bd0-b7be-87a45e9a1f6e', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 00:23:07.453668+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '1904a2db-c6fa-47e2-8617-a12ac8a03477', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 00:23:07.455765+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '18a8bf14-d441-4a2a-b117-d2b644e3953e', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 17:44:37.121864+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '2f6caa30-c676-46e1-84c7-12a3ed518b27', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 17:44:37.127925+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '1cabff27-58e5-43ab-9969-043a49db07d1', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 18:43:54.082934+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'e059833b-cbab-4bd5-957b-e9af496844f1', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 18:43:54.08577+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '1f9a84d3-152f-48a2-89a7-9d18fbdf7842', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 19:44:47.894241+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'fcd6b2c6-0ec4-464d-92e9-ef110e68cbdd', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 19:44:47.895342+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '54d5f053-174b-44c6-a62e-7da25b9e54f8', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 20:43:17.703543+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '5eed5beb-cf0f-425f-a131-acc1a12e5f1f', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 20:43:17.705477+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '7ae56873-0ea0-4ee3-bfed-0a642f3cb107', '{"action":"logout","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account"}', '2026-03-02 21:40:19.594508+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '3c29f299-2a4f-4bfe-b87d-113795df6c04', '{"action":"login","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2026-03-02 21:42:47.042105+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'c32b3f74-e577-4c29-a431-6d2140d839d2', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 23:34:39.196408+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '2c49942d-567e-45fd-840d-24a623d14103', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-02 23:34:39.197538+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'c814c1e1-e023-4021-b0eb-be87ff36ecd3', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-03 00:41:45.556393+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f19b1234-9258-4a57-9226-09707f6f96d9', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-03 00:41:45.559008+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'a89b0cdd-290a-433a-8dbd-cfc4d1b05c2b', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-04 19:10:26.674576+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'ebdfe125-6892-4d23-b5de-406ad7c338e0', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-04 19:10:26.677553+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '2d838517-5c50-49e0-b550-9e0e4baa8b51', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-04 20:17:00.640514+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'c25117b8-2a44-4c97-b44b-93c9160b0e49', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-04 20:17:00.642539+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', 'f3978c83-74c4-45ba-af36-2b6efe5b59f6', '{"action":"token_refreshed","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-11 00:28:04.227608+00', '');
INSERT INTO auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) VALUES ('00000000-0000-0000-0000-000000000000', '7fdf27f2-3144-42fd-8a11-091761a42dbe', '{"action":"token_revoked","actor_id":"2d353feb-16d5-43fb-9529-d1334f4c6059","actor_username":"admin@cotizador.com","actor_via_sso":false,"log_type":"token"}', '2026-03-11 00:28:04.236826+00', '');


ALTER TABLE auth.audit_log_entries ENABLE TRIGGER ALL;

--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.flow_state DISABLE TRIGGER ALL;



ALTER TABLE auth.flow_state ENABLE TRIGGER ALL;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.users DISABLE TRIGGER ALL;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) VALUES ('00000000-0000-0000-0000-000000000000', '9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0', 'authenticated', 'authenticated', 'admin@plazamayor.com', '$2a$10$c7sQRjMmvT1wkycMS4cP3OQpQeazHwVIGigusfiHnKfmoI/sLM67K', '2026-02-16 21:40:39.269764+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-02-16 22:47:49.793702+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-02-16 21:40:39.199911+00', '2026-02-16 22:47:49.801613+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) VALUES ('00000000-0000-0000-0000-000000000000', '1b099fcd-164b-49dc-af4a-c64f4b16961d', 'authenticated', 'authenticated', 'admin@casadepiedra.com', '$2a$10$dACIeFDOpmNSpnTFq.3w9eFgkD44GuwHRRB/PLLPdv5nLi33TjRNK', '2026-02-16 22:36:58.203281+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-02-16 22:52:12.700844+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-02-16 22:36:58.18393+00', '2026-02-16 22:52:12.705347+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) VALUES ('00000000-0000-0000-0000-000000000000', '2d353feb-16d5-43fb-9529-d1334f4c6059', 'authenticated', 'authenticated', 'admin@cotizador.com', '$2a$10$Q3ftpiGxXHCMuIGH0Z7BI.KFU6zrVJCNv/7hL5GsDpGfJQCwS4oGO', '2026-02-14 21:12:20.675521+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-03-02 21:42:47.044468+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-02-14 21:12:20.567887+00', '2026-03-11 00:28:04.250326+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


ALTER TABLE auth.users ENABLE TRIGGER ALL;

--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.identities DISABLE TRIGGER ALL;

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) VALUES ('2d353feb-16d5-43fb-9529-d1334f4c6059', '2d353feb-16d5-43fb-9529-d1334f4c6059', '{"sub": "2d353feb-16d5-43fb-9529-d1334f4c6059", "email": "admin@cotizador.com", "email_verified": false, "phone_verified": false}', 'email', '2026-02-14 21:12:20.639345+00', '2026-02-14 21:12:20.639754+00', '2026-02-14 21:12:20.639754+00', 'cbdaa093-acfc-4740-902e-381bbd6fc375');
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) VALUES ('9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0', '9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0', '{"sub": "9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0", "email": "admin@plazamayor.com", "email_verified": false, "phone_verified": false}', 'email', '2026-02-16 21:40:39.259102+00', '2026-02-16 21:40:39.259625+00', '2026-02-16 21:40:39.259625+00', '8bcc7013-a598-44c7-b9d0-77b7c0220616');
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) VALUES ('1b099fcd-164b-49dc-af4a-c64f4b16961d', '1b099fcd-164b-49dc-af4a-c64f4b16961d', '{"sub": "1b099fcd-164b-49dc-af4a-c64f4b16961d", "email": "admin@casadepiedra.com", "email_verified": false, "phone_verified": false}', 'email', '2026-02-16 22:36:58.193872+00', '2026-02-16 22:36:58.193934+00', '2026-02-16 22:36:58.193934+00', '75cd4b7f-bab8-40ca-9b89-7c25fa7d08a4');


ALTER TABLE auth.identities ENABLE TRIGGER ALL;

--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.instances DISABLE TRIGGER ALL;



ALTER TABLE auth.instances ENABLE TRIGGER ALL;

--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.oauth_clients DISABLE TRIGGER ALL;



ALTER TABLE auth.oauth_clients ENABLE TRIGGER ALL;

--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.sessions DISABLE TRIGGER ALL;

INSERT INTO auth.sessions (id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag, oauth_client_id, refresh_token_hmac_key, refresh_token_counter, scopes) VALUES ('75f44180-d293-485c-a5aa-303d034ca462', '2d353feb-16d5-43fb-9529-d1334f4c6059', '2026-03-02 21:42:47.044907+00', '2026-03-11 00:28:04.258639+00', NULL, 'aal1', NULL, '2026-03-11 00:28:04.258402', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 OPR/127.0.0.0 (Edition std-2)', '172.18.0.1', NULL, NULL, NULL, NULL, NULL);


ALTER TABLE auth.sessions ENABLE TRIGGER ALL;

--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.mfa_amr_claims DISABLE TRIGGER ALL;

INSERT INTO auth.mfa_amr_claims (session_id, created_at, updated_at, authentication_method, id) VALUES ('75f44180-d293-485c-a5aa-303d034ca462', '2026-03-02 21:42:47.053058+00', '2026-03-02 21:42:47.053058+00', 'password', '6858d07d-7bd2-41af-bf2e-effc067d3fe2');


ALTER TABLE auth.mfa_amr_claims ENABLE TRIGGER ALL;

--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.mfa_factors DISABLE TRIGGER ALL;



ALTER TABLE auth.mfa_factors ENABLE TRIGGER ALL;

--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.mfa_challenges DISABLE TRIGGER ALL;



ALTER TABLE auth.mfa_challenges ENABLE TRIGGER ALL;

--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.oauth_authorizations DISABLE TRIGGER ALL;



ALTER TABLE auth.oauth_authorizations ENABLE TRIGGER ALL;

--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.oauth_client_states DISABLE TRIGGER ALL;



ALTER TABLE auth.oauth_client_states ENABLE TRIGGER ALL;

--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.oauth_consents DISABLE TRIGGER ALL;



ALTER TABLE auth.oauth_consents ENABLE TRIGGER ALL;

--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.one_time_tokens DISABLE TRIGGER ALL;



ALTER TABLE auth.one_time_tokens ENABLE TRIGGER ALL;

--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.refresh_tokens DISABLE TRIGGER ALL;

INSERT INTO auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) VALUES ('00000000-0000-0000-0000-000000000000', 128, 'bh6bbeixwpod', '2d353feb-16d5-43fb-9529-d1334f4c6059', true, '2026-03-02 21:42:47.049158+00', '2026-03-02 23:34:39.198351+00', NULL, '75f44180-d293-485c-a5aa-303d034ca462');
INSERT INTO auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) VALUES ('00000000-0000-0000-0000-000000000000', 129, '3koviaxfgmuq', '2d353feb-16d5-43fb-9529-d1334f4c6059', true, '2026-03-02 23:34:39.201716+00', '2026-03-03 00:41:45.559996+00', 'bh6bbeixwpod', '75f44180-d293-485c-a5aa-303d034ca462');
INSERT INTO auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) VALUES ('00000000-0000-0000-0000-000000000000', 130, '34zg62uxnwvd', '2d353feb-16d5-43fb-9529-d1334f4c6059', true, '2026-03-03 00:41:45.562078+00', '2026-03-04 19:10:26.678177+00', '3koviaxfgmuq', '75f44180-d293-485c-a5aa-303d034ca462');
INSERT INTO auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) VALUES ('00000000-0000-0000-0000-000000000000', 163, '7oohirjghcxl', '2d353feb-16d5-43fb-9529-d1334f4c6059', true, '2026-03-04 19:10:26.678756+00', '2026-03-04 20:17:00.643342+00', '34zg62uxnwvd', '75f44180-d293-485c-a5aa-303d034ca462');
INSERT INTO auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) VALUES ('00000000-0000-0000-0000-000000000000', 164, 'odznwahdwcjd', '2d353feb-16d5-43fb-9529-d1334f4c6059', true, '2026-03-04 20:17:00.644688+00', '2026-03-11 00:28:04.239702+00', '7oohirjghcxl', '75f44180-d293-485c-a5aa-303d034ca462');
INSERT INTO auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) VALUES ('00000000-0000-0000-0000-000000000000', 165, '2ngmhv4setlf', '2d353feb-16d5-43fb-9529-d1334f4c6059', false, '2026-03-11 00:28:04.243081+00', '2026-03-11 00:28:04.243081+00', 'odznwahdwcjd', '75f44180-d293-485c-a5aa-303d034ca462');


ALTER TABLE auth.refresh_tokens ENABLE TRIGGER ALL;

--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.sso_providers DISABLE TRIGGER ALL;



ALTER TABLE auth.sso_providers ENABLE TRIGGER ALL;

--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.saml_providers DISABLE TRIGGER ALL;



ALTER TABLE auth.saml_providers ENABLE TRIGGER ALL;

--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.saml_relay_states DISABLE TRIGGER ALL;



ALTER TABLE auth.saml_relay_states ENABLE TRIGGER ALL;

--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.schema_migrations DISABLE TRIGGER ALL;

INSERT INTO auth.schema_migrations (version) VALUES ('20171026211738');
INSERT INTO auth.schema_migrations (version) VALUES ('20171026211808');
INSERT INTO auth.schema_migrations (version) VALUES ('20171026211834');
INSERT INTO auth.schema_migrations (version) VALUES ('20180103212743');
INSERT INTO auth.schema_migrations (version) VALUES ('20180108183307');
INSERT INTO auth.schema_migrations (version) VALUES ('20180119214651');
INSERT INTO auth.schema_migrations (version) VALUES ('20180125194653');
INSERT INTO auth.schema_migrations (version) VALUES ('00');
INSERT INTO auth.schema_migrations (version) VALUES ('20210710035447');
INSERT INTO auth.schema_migrations (version) VALUES ('20210722035447');
INSERT INTO auth.schema_migrations (version) VALUES ('20210730183235');
INSERT INTO auth.schema_migrations (version) VALUES ('20210909172000');
INSERT INTO auth.schema_migrations (version) VALUES ('20210927181326');
INSERT INTO auth.schema_migrations (version) VALUES ('20211122151130');
INSERT INTO auth.schema_migrations (version) VALUES ('20211124214934');
INSERT INTO auth.schema_migrations (version) VALUES ('20211202183645');
INSERT INTO auth.schema_migrations (version) VALUES ('20220114185221');
INSERT INTO auth.schema_migrations (version) VALUES ('20220114185340');
INSERT INTO auth.schema_migrations (version) VALUES ('20220224000811');
INSERT INTO auth.schema_migrations (version) VALUES ('20220323170000');
INSERT INTO auth.schema_migrations (version) VALUES ('20220429102000');
INSERT INTO auth.schema_migrations (version) VALUES ('20220531120530');
INSERT INTO auth.schema_migrations (version) VALUES ('20220614074223');
INSERT INTO auth.schema_migrations (version) VALUES ('20220811173540');
INSERT INTO auth.schema_migrations (version) VALUES ('20221003041349');
INSERT INTO auth.schema_migrations (version) VALUES ('20221003041400');
INSERT INTO auth.schema_migrations (version) VALUES ('20221011041400');
INSERT INTO auth.schema_migrations (version) VALUES ('20221020193600');
INSERT INTO auth.schema_migrations (version) VALUES ('20221021073300');
INSERT INTO auth.schema_migrations (version) VALUES ('20221021082433');
INSERT INTO auth.schema_migrations (version) VALUES ('20221027105023');
INSERT INTO auth.schema_migrations (version) VALUES ('20221114143122');
INSERT INTO auth.schema_migrations (version) VALUES ('20221114143410');
INSERT INTO auth.schema_migrations (version) VALUES ('20221125140132');
INSERT INTO auth.schema_migrations (version) VALUES ('20221208132122');
INSERT INTO auth.schema_migrations (version) VALUES ('20221215195500');
INSERT INTO auth.schema_migrations (version) VALUES ('20221215195800');
INSERT INTO auth.schema_migrations (version) VALUES ('20221215195900');
INSERT INTO auth.schema_migrations (version) VALUES ('20230116124310');
INSERT INTO auth.schema_migrations (version) VALUES ('20230116124412');
INSERT INTO auth.schema_migrations (version) VALUES ('20230131181311');
INSERT INTO auth.schema_migrations (version) VALUES ('20230322519590');
INSERT INTO auth.schema_migrations (version) VALUES ('20230402418590');
INSERT INTO auth.schema_migrations (version) VALUES ('20230411005111');
INSERT INTO auth.schema_migrations (version) VALUES ('20230508135423');
INSERT INTO auth.schema_migrations (version) VALUES ('20230523124323');
INSERT INTO auth.schema_migrations (version) VALUES ('20230818113222');
INSERT INTO auth.schema_migrations (version) VALUES ('20230914180801');
INSERT INTO auth.schema_migrations (version) VALUES ('20231027141322');
INSERT INTO auth.schema_migrations (version) VALUES ('20231114161723');
INSERT INTO auth.schema_migrations (version) VALUES ('20231117164230');
INSERT INTO auth.schema_migrations (version) VALUES ('20240115144230');
INSERT INTO auth.schema_migrations (version) VALUES ('20240214120130');
INSERT INTO auth.schema_migrations (version) VALUES ('20240306115329');
INSERT INTO auth.schema_migrations (version) VALUES ('20240314092811');
INSERT INTO auth.schema_migrations (version) VALUES ('20240427152123');
INSERT INTO auth.schema_migrations (version) VALUES ('20240612123726');
INSERT INTO auth.schema_migrations (version) VALUES ('20240729123726');
INSERT INTO auth.schema_migrations (version) VALUES ('20240802193726');
INSERT INTO auth.schema_migrations (version) VALUES ('20240806073726');
INSERT INTO auth.schema_migrations (version) VALUES ('20241009103726');
INSERT INTO auth.schema_migrations (version) VALUES ('20250717082212');
INSERT INTO auth.schema_migrations (version) VALUES ('20250731150234');
INSERT INTO auth.schema_migrations (version) VALUES ('20250804100000');
INSERT INTO auth.schema_migrations (version) VALUES ('20250901200500');
INSERT INTO auth.schema_migrations (version) VALUES ('20250903112500');
INSERT INTO auth.schema_migrations (version) VALUES ('20250904133000');
INSERT INTO auth.schema_migrations (version) VALUES ('20250925093508');
INSERT INTO auth.schema_migrations (version) VALUES ('20251007112900');
INSERT INTO auth.schema_migrations (version) VALUES ('20251104100000');
INSERT INTO auth.schema_migrations (version) VALUES ('20251111201300');
INSERT INTO auth.schema_migrations (version) VALUES ('20251201000000');
INSERT INTO auth.schema_migrations (version) VALUES ('20260115000000');
INSERT INTO auth.schema_migrations (version) VALUES ('20260121000000');


ALTER TABLE auth.schema_migrations ENABLE TRIGGER ALL;

--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: pocketbase_auth_admin
--

ALTER TABLE auth.sso_domains DISABLE TRIGGER ALL;



ALTER TABLE auth.sso_domains ENABLE TRIGGER ALL;

--
-- Data for Name: clientes; Type: TABLE DATA; Schema: finanzas; Owner: postgres
--

ALTER TABLE finanzas.clientes DISABLE TRIGGER ALL;

INSERT INTO finanzas.clientes (id, nombre_completo, telefono, correo, rfc, created_at, updated_at) VALUES ('2997e5c2-62c3-40ec-8c1f-1da0c20380ae', 'Johan Jacob Paz Valadez', '4771631661', 'johan_paz@hotmail.es', 'PAVJ011113PB6', '2026-01-26 23:37:50.548335+00', '2026-01-26 23:37:50.548335+00');


ALTER TABLE finanzas.clientes ENABLE TRIGGER ALL;

--
-- Data for Name: conceptos_catalogo; Type: TABLE DATA; Schema: finanzas; Owner: postgres
--

ALTER TABLE finanzas.conceptos_catalogo DISABLE TRIGGER ALL;

INSERT INTO finanzas.conceptos_catalogo (id, nombre, precio_sugerido, activo, created_at) VALUES (1, 'Limpieza', 0, true, '2025-12-19 08:29:59.031025+00');
INSERT INTO finanzas.conceptos_catalogo (id, nombre, precio_sugerido, activo, created_at) VALUES (3, 'Mobiliario', 0, true, '2025-12-19 08:30:57.056834+00');
INSERT INTO finanzas.conceptos_catalogo (id, nombre, precio_sugerido, activo, created_at) VALUES (4, 'Seguridad', 500, true, '2025-12-19 08:31:41.47937+00');
INSERT INTO finanzas.conceptos_catalogo (id, nombre, precio_sugerido, activo, created_at) VALUES (5, 'Instalación', 0, true, '2025-12-19 08:36:01.791921+00');


ALTER TABLE finanzas.conceptos_catalogo ENABLE TRIGGER ALL;

--
-- Data for Name: configuracion; Type: TABLE DATA; Schema: finanzas; Owner: pocketbase_admin
--

ALTER TABLE finanzas.configuracion DISABLE TRIGGER ALL;

INSERT INTO finanzas.configuracion (id, clave, valor_num, valor_json, created_at, updated_at) VALUES (1, 'premontaje_pct', 25, '{"value": 25, "percent": 25, "updated_at": "2026-02-28T21:18:56.523Z"}', '2026-02-28 21:15:03.254274+00', '2026-02-28 21:18:56.564322+00');
INSERT INTO finanzas.configuracion (id, clave, valor_num, valor_json, created_at, updated_at) VALUES (3, 'hora_extra_cfg', 100, '{"mode": "percent", "value": 100, "updated_at": "2026-03-02T01:02:48.454Z", "allow_custom": true}', '2026-03-02 01:02:48.474396+00', '2026-03-02 01:02:48.474396+00');


ALTER TABLE finanzas.configuracion ENABLE TRIGGER ALL;

--
-- Data for Name: espacios; Type: TABLE DATA; Schema: finanzas; Owner: postgres
--

ALTER TABLE finanzas.espacios DISABLE TRIGGER ALL;

INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (7, '2025-12-20 07:04:29.567599+00', 'Z1-2', 'Muro a un lado de Samsung y Zara', 'publicidad', 'Ubicación: En zona 1 en el acceso a zona 3, a un costado de Coloso y Zara.
Material: Por definir.
Medidas: Por definir.', NULL, NULL, true, 26250, 'ninguno', 10, true, '[1]', '#d270ff', '["Muro", "Pasillo"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (9, '2025-12-20 07:08:59.400205+00', 'Z1-9', 'Muro espectacular entre Zara y Massimo Dutti', 'publicidad', 'Ubicación: En zona 3, frente a Sears, de cara al domo principal.
Material: Vinil sobre bastidor.
Medidas: 13.0m x 3.0m.', NULL, NULL, true, 50000, 'ninguno', 0, true, '[1]', '#ff0000', '["Muro", "Espectacular", "Pasillo", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (10, '2025-12-20 07:16:40.474455+00', 'Z 2-1', 'Antepecho pasillo a C&A', 'publicidad', 'Ubicación: En el pasillo de salida de zona 2 y entrada a zona 1 por la pista de hielo.
Material: Por definir.
Medidas: Por definir.', NULL, NULL, true, 55700, 'ninguno', 0, true, '[1]', '#1f3db2', '["Antepecho", "Pasillo"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (11, '2025-12-20 07:20:50.282639+00', 'Z3-5', 'Escaleras del domo principal (2 caras)', 'publicidad', 'Ubicación: En zona 3, frente a Sears, Zara, Liverpool y la isla de Starbucks.
Material: Por definir.
Medidas: Por definir.', NULL, NULL, true, 45000, 'ninguno', 0, true, '[1]', '#02d911', '["Escaleras", "Domo"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (12, '2025-12-20 07:23:15.460771+00', 'Z3-6', 'Paquete de 10 pendones interiores', 'publicidad', 'Ubicación: En los principales pasillos de zona 3, visibles desde primer y segundo piso.
Material: Lona.
Medidas: 70cm x 500cm.', NULL, NULL, true, 49000, 'ninguno', 0, true, '[1]', '#0760ed', '["Pendones", "Paquete", "Aéreo", "Lona"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (13, '2025-12-20 07:25:00.035535+00', 'Z3-8', 'Puente en pasillo principal', 'publicidad', 'Ubicación: Pasillo principal de zona 3, visible desde primer y segundo piso.
Material: Lona sobre bastidor.
Medidas: 7.28m x 1.19m.', NULL, NULL, true, 40000, 'ninguno', 0, true, '[1]', '#0d59d3', '["Puente", "Aéreo", "Pasillo", "Lona"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (14, '2025-12-20 07:26:51.569723+00', 'Z3-12', 'Espectacular sobre balcón Sears', 'publicidad', 'Ubicación: En zona 1, entre Zara y Massimo Dutti, con vista al pórtico 1.
Material: Lona sobre bastidor.
Medidas: Por definir.', NULL, NULL, true, 45000, 'ninguno', 0, true, '[1]', '#045be7', '["Espectacular", "Aéreo", "Lona"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (15, '2025-12-20 07:29:08.693861+00', 'Z3-21', 'Ave en domo principal', 'publicidad', 'Ubicación: Debajo del domo principal en zona 3.
Material: Lona sobre bastidor.
Medidas: Por definir.', NULL, NULL, true, 49000, 'ninguno', 0, true, '[1]', '#00a8f0', '["Aéreo", "Domo", "Lona"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (16, '2025-12-20 07:31:25.215651+00', 'Z4-1', 'Cristales interiores de escaleras eléctricas', 'publicidad', 'Ubicación: En zona 4, frente al acceso del pórtico 4 y acceso a planta hacia Cinemex.
Material: Vinil autoadherible.
Medidas: Por definir.', NULL, NULL, true, 40000, 'ninguno', 0, true, '[1]', '#59ff00', '["Cristal", "Escaleras", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (18, '2025-12-20 07:34:54.80137+00', 'Z4-3', 'Cristal superior zona de cajeros', 'publicidad', 'Ubicación: En zona 6, frente a H&M de cara a explanada de fuente y diversas islas.
Material: Por definir.
Medidas: Por definir.', NULL, NULL, true, 30000, 'ninguno', 0, true, '[1]', '#58c80e', '["Cristal", "Muro"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (27, '2025-12-20 07:56:55.879847+00', 'EST 253 E-F', 'Paquete de 5 pendones de estacionamiento', 'publicidad', 'Ubicación: Variedad de zonas y tamaños en estacionamiento.
Material: Lona en bastidor.
Medidas: Por definir.', NULL, NULL, true, 25000, 'ninguno', 0, true, '[1]', '#2f75e4', '["Estacionamiento", "Pendones", "Paquete", "Lona"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (6, '2025-12-20 06:58:46.890044+00', 'ZM-1', 'Puente entre Banamex y Sanborns', 'publicidad', 'Ubicación: Entre Banamex y Sanborns de cara al pórtico 1.
Material: Lona.
Medidas: Por definir.', NULL, NULL, true, 40000, 'ninguno', 0, true, '[1]', '#8400f0', '["Puente", "Aéreo", "Lona"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (8, '2025-12-20 07:07:16.189218+00', 'Z1-3', 'Ave en Domo Suburbia', 'publicidad', 'Ubicación: Debajo del domo principal en zona 1.
Material: Por definir.
Medidas: Por definir.', NULL, NULL, true, 49000, 'ninguno', 0, true, '[1]', '#e65c00', '["Aéreo", "Domo"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (17, '2025-12-20 07:33:33.864034+00', 'Z4-2', 'Cristales exteriores de escaleras eléctricas', 'publicidad', 'Ubicación: En zona 4, frente al acceso del pórtico 4 y acceso a segunda planta hacia Cinemex.
Material: Vinil autoadherible.
Medidas: 2.77m x 3.65m.', NULL, NULL, true, 45000, 'ninguno', 0, true, '[1]', '#29d1c6', '["Cristal", "Escaleras", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (19, '2025-12-20 07:36:54.875585+00', 'Z5-2', 'Elevador panorámico', 'publicidad', 'Ubicación: En zona 5 frente al acceso del pórtico 4 y acceso a segunda planta hacia Cinemex.
Material: Vinil autoadherible.
Medidas: 2.14m x 9.77m.', NULL, NULL, true, 45000, 'ninguno', 0, true, '[1]', '#cf7207', '["Elevador", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (20, '2025-12-20 07:39:01.375808+00', 'Z6-1', 'Cristales laterales de escaleras Banana Republic', 'publicidad', 'Ubicación: Zona 6 en el pasillo principal frente a Banana Republic, Stradivarius, etc.
Material: Vinil autoadherible.
Medidas: Por definir.', NULL, NULL, true, 45000, 'ninguno', 0, true, '[1]', '#ff2600', '["Cristal", "Escaleras", "Pasillo", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (21, '2025-12-20 07:41:29.823064+00', 'Z4-2 VAR 2', 'Cristales exteriores de escaleras eléctricas', 'publicidad', 'Ubicación: En zona 4 frente a Zara home en el centro de Zona Moda.
Material: Vinil autoadherible.
Medidas: 2.77m x 3.65m.', NULL, NULL, true, 40000, 'ninguno', 0, true, '[1]', '#ff0000', '["Cristal", "Escaleras", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (22, '2025-12-20 07:46:17.354029+00', 'Z4-2 VAR 3', 'Cristal exterior de escaleras eléctricas', 'publicidad', 'Ubicación: En zona 4 frente a H&M en el acceso a Zona Moda.
Material: Vinil autoadherible.
Medidas: Por definir.', NULL, NULL, true, 35000, 'ninguno', 0, true, '[1]', '#f26363', '["Cristal", "Escaleras", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (23, '2025-12-20 07:48:01.2117+00', 'Z7-12', 'Puente central de pasillo', 'publicidad', 'Ubicación: En zona 6 frente a H&M y Vans, de cara a zona de cajeros.
Material: Vinil autoadherible.
Medidas: Por definir.', NULL, NULL, true, 39500, 'ninguno', 0, true, '[1]', '#e511e8', '["Puente", "Aéreo", "Pasillo", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (24, '2025-12-20 07:49:58.602475+00', 'Z7-12 VAR 2', 'Puente central de pasillo', 'publicidad', 'Ubicación: En zona 6, frente a H&M y Vans de cara a escaleras eléctricas.
Material: Vinil autoadherible.
Medidas: Por definir.', NULL, NULL, true, 39500, 'ninguno', 0, true, '[1]', '#0042ad', '["Puente", "Aéreo", "Pasillo", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (25, '2025-12-20 07:51:35.184942+00', 'Z6-4', 'Dorso de elevador zona 6', 'publicidad', 'Ubicación: En zona 6 a la salida del subterráneo, de cara al pasillo principal.
Material: Vinil autoadherible.
Medidas: Por definir.', NULL, NULL, true, 50000, 'ninguno', 0, true, '[1]', '#5a00a3', '["Elevador", "Subterráneo", "Pasillo", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (26, '2025-12-20 07:55:00.58807+00', 'PENDIENTE', 'Escaleras eléctricas subterráneo Liverpool (2 caras)', 'publicidad', 'Ubicación: En zona 7 a la salida del subterráneo que da a Liverpool y al foro de Zona Moda.
Material: Vinil autoadherible.
Medidas: Por definir.', NULL, NULL, true, 32000, 'ninguno', 0, true, '[1]', '#8affb7', '["Escaleras", "Subterráneo", "Vinil"]');
INSERT INTO finanzas.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, etiquetas) VALUES (28, '2025-12-20 07:58:56.189177+00', 'EST 254 E-G', 'Paquete de 10 plumas de estacionamiento', 'publicidad', 'Ubicación: Variedad de salidas de estacionamiento.
Material: Vinil.
Medidas: Por definir.', NULL, NULL, true, 40000, 'ninguno', 0, true, '[1]', '#e6a800', '["Estacionamiento", "Paquete", "Vinil"]');


ALTER TABLE finanzas.espacios ENABLE TRIGGER ALL;

--
-- Data for Name: cotizaciones; Type: TABLE DATA; Schema: finanzas; Owner: postgres
--

ALTER TABLE finanzas.cotizaciones DISABLE TRIGGER ALL;

INSERT INTO finanzas.cotizaciones (id, created_at, creado_por, espacio_id, espacio_nombre, espacio_clave, cliente_nombre, cliente_rfc, cliente_contacto, cliente_email, cliente_telefono, fecha_inicio, fecha_fin, precio_final, desglose_precios, status, numero_orden, numero_contrato, factura_pdf_url, factura_xml_url, contrato_url, url_cotizacion_final, url_orden_compra, fecha_orden_compra, datos_fiscales, conceptos_adicionales, tipo_ajuste, valor_ajuste, ajuste_es_porcentaje, desglose_impuestos, historial_pagos, datos_factura, cliente_id, nombre_cotizacion, espacios_detalle, detalles_evento, permanencia_personalizada) VALUES ('0e6c064c-c237-4d26-97a2-f8f083cd056e', '2026-03-02 20:43:33.223191+00', '2d353feb-16d5-43fb-9529-d1334f4c6059', 6, 'Puente entre Banamex y Sanborns', 'ZM-1', 'Johan Jacob Paz Valadez', 'PAVJ011113PB6', '4771631661', 'johan_paz@hotmail.es', NULL, '2026-03-01', '2026-03-31', 46400, '{"espacios": [{"fecha_fin": "2026-03-30", "espacio_id": "6", "fecha_inicio": "2026-03-01", "espacio_clave": "ZM-1", "impuestos_ids": [1], "total_espacio": 46400, "espacio_nombre": "Puente entre Banamex y Sanborns", "impuestos_total": 6400, "subtotal_espacio": 40000, "precio_personalizado": null, "permanencia_personalizada": false}], "tax_total": 6400, "impuestos_detalle": ["1"], "subtotal_antes_impuestos": 40000}', 'aprobada', '0E6C064C', NULL, NULL, NULL, NULL, '0e6c064c-c237-4d26-97a2-f8f083cd056e/cotizacion_aprobada_0E6C064C.pdf', NULL, NULL, '{}', '[]', 'ninguno', 0, false, '[]', '[]', '{}', NULL, 'COTORRISA', '[{"fecha_fin": "2026-03-31", "espacio_id": "6", "fecha_inicio": "2026-03-01", "espacio_clave": "ZM-1", "impuestos_ids": [1], "total_espacio": 46400, "espacio_nombre": "Puente entre Banamex y Sanborns", "impuestos_total": 6400, "subtotal_espacio": 40000, "precio_personalizado": null, "permanencia_personalizada": false}]', '{"multi_espacio": false, "total_espacios": 1, "nombre_cotizacion": "COTORRISA", "permanencia_personalizada": false}', false);
INSERT INTO finanzas.cotizaciones (id, created_at, creado_por, espacio_id, espacio_nombre, espacio_clave, cliente_nombre, cliente_rfc, cliente_contacto, cliente_email, cliente_telefono, fecha_inicio, fecha_fin, precio_final, desglose_precios, status, numero_orden, numero_contrato, factura_pdf_url, factura_xml_url, contrato_url, url_cotizacion_final, url_orden_compra, fecha_orden_compra, datos_fiscales, conceptos_adicionales, tipo_ajuste, valor_ajuste, ajuste_es_porcentaje, desglose_impuestos, historial_pagos, datos_factura, cliente_id, nombre_cotizacion, espacios_detalle, detalles_evento, permanencia_personalizada) VALUES ('9b881a18-33b3-4c20-beb5-528de06e103f', '2026-03-02 21:33:15.709877+00', '2d353feb-16d5-43fb-9529-d1334f4c6059', 6, 'Puente entre Banamex y Sanborns', 'ZM-1', 'Johan Jacob Paz Valadez', 'PAVJ011113PB6', '4771631661', 'johan_paz@hotmail.es', NULL, '2026-04-01', '2026-04-30', 23200, '{"espacios": [{"fecha_fin": "2026-04-22", "espacio_id": 6, "fecha_inicio": "2026-04-15", "espacio_clave": "ZM-1", "impuestos_ids": [1], "total_espacio": 23200, "espacio_nombre": "Puente entre Banamex y Sanborns", "impuestos_total": 3200, "subtotal_espacio": 20000, "precio_personalizado": 20000, "permanencia_personalizada": true}], "tax_total": 3200, "impuestos_detalle": ["1"], "subtotal_antes_impuestos": 20000}', 'pendiente', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', '[]', 'ninguno', 0, false, '[]', '[]', '{}', '2997e5c2-62c3-40ec-8c1f-1da0c20380ae', 'Johan Jacob Paz Valadez - Puente entre Banamex y Sanborns', '[{"fecha_fin": "2026-04-30", "espacio_id": 6, "fecha_inicio": "2026-04-01", "espacio_clave": "ZM-1", "impuestos_ids": [1], "total_espacio": 23200, "espacio_nombre": "Puente entre Banamex y Sanborns", "impuestos_total": 3200, "subtotal_espacio": 20000, "precio_personalizado": 20000, "permanencia_personalizada": true}]', '{"multi_espacio": false, "total_espacios": 1, "nombre_cotizacion": "Johan Jacob Paz Valadez - Puente entre Banamex y Sanborns", "permanencia_personalizada": true}', false);
INSERT INTO finanzas.cotizaciones (id, created_at, creado_por, espacio_id, espacio_nombre, espacio_clave, cliente_nombre, cliente_rfc, cliente_contacto, cliente_email, cliente_telefono, fecha_inicio, fecha_fin, precio_final, desglose_precios, status, numero_orden, numero_contrato, factura_pdf_url, factura_xml_url, contrato_url, url_cotizacion_final, url_orden_compra, fecha_orden_compra, datos_fiscales, conceptos_adicionales, tipo_ajuste, valor_ajuste, ajuste_es_porcentaje, desglose_impuestos, historial_pagos, datos_factura, cliente_id, nombre_cotizacion, espacios_detalle, detalles_evento, permanencia_personalizada) VALUES ('9c380c0b-3c53-4676-91a8-e7e009c80c3a', '2026-03-02 21:36:14.940759+00', '2d353feb-16d5-43fb-9529-d1334f4c6059', 6, 'Puente entre Banamex y Sanborns + 1 espacio(s)', 'MULTI', 'Johan Jacob Paz Valadez', 'PAVJ011113PB6', '4771631661', 'johan_paz@hotmail.es', NULL, '2026-04-01', '2026-05-31', 76850, '{"espacios": [{"fecha_fin": "2026-05-07", "espacio_id": 6, "fecha_inicio": "2026-04-08", "espacio_clave": "ZM-1", "impuestos_ids": [1], "total_espacio": 46400, "espacio_nombre": "Puente entre Banamex y Sanborns", "impuestos_total": 6400, "subtotal_espacio": 40000, "precio_personalizado": null, "permanencia_personalizada": false}, {"fecha_fin": "2026-04-30", "espacio_id": 7, "fecha_inicio": "2026-04-01", "espacio_clave": "Z1-2", "impuestos_ids": [1], "total_espacio": 30450, "espacio_nombre": "Muro a un lado de Samsung y Zara", "impuestos_total": 4200, "subtotal_espacio": 26250, "precio_personalizado": null, "permanencia_personalizada": false}], "tax_total": 10600, "impuestos_detalle": ["1"], "subtotal_antes_impuestos": 66250}', 'pendiente', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', '[]', 'ninguno', 0, false, '[]', '[]', '{}', '2997e5c2-62c3-40ec-8c1f-1da0c20380ae', 'Johan Jacob Paz Valadez - Puente entre Banamex y Sanborns + Muro a un lado de Samsung y Zara', '[{"fecha_fin": "2026-05-31", "espacio_id": 6, "fecha_inicio": "2026-04-01", "espacio_clave": "ZM-1", "impuestos_ids": [1], "total_espacio": 46400, "espacio_nombre": "Puente entre Banamex y Sanborns", "impuestos_total": 6400, "subtotal_espacio": 40000, "precio_personalizado": null, "permanencia_personalizada": false}, {"fecha_fin": "2026-04-30", "espacio_id": 7, "fecha_inicio": "2026-04-01", "espacio_clave": "Z1-2", "impuestos_ids": [1], "total_espacio": 30450, "espacio_nombre": "Muro a un lado de Samsung y Zara", "impuestos_total": 4200, "subtotal_espacio": 26250, "precio_personalizado": null, "permanencia_personalizada": false}]', '{"multi_espacio": true, "total_espacios": 2, "nombre_cotizacion": "Johan Jacob Paz Valadez - Puente entre Banamex y Sanborns + Muro a un lado de Samsung y Zara", "permanencia_personalizada": false}', false);


ALTER TABLE finanzas.cotizaciones ENABLE TRIGGER ALL;

--
-- Data for Name: impuestos; Type: TABLE DATA; Schema: finanzas; Owner: postgres
--

ALTER TABLE finanzas.impuestos DISABLE TRIGGER ALL;

INSERT INTO finanzas.impuestos (id, nombre, porcentaje, activo, created_at, impuestos_aplicados) VALUES (1, 'IVA', 16, true, '2025-12-20 05:00:37.668293+00', NULL);


ALTER TABLE finanzas.impuestos ENABLE TRIGGER ALL;

--
-- Data for Name: clientes; Type: TABLE DATA; Schema: finanzas_casadepiedra; Owner: postgres
--

ALTER TABLE finanzas_casadepiedra.clientes DISABLE TRIGGER ALL;

INSERT INTO finanzas_casadepiedra.clientes (id, nombre_completo, telefono, correo, rfc, created_at, updated_at) VALUES ('b51df6c1-e0f1-4860-904d-8b03cd055d79', 'Johan Jacob Paz Valadez', '4771631661', 'johanjacobpazvaladez@gmail.com', 'PAVJ011113PB6', '2026-01-26 23:50:37.517036+00', '2026-01-26 23:50:37.517036+00');
INSERT INTO finanzas_casadepiedra.clientes (id, nombre_completo, telefono, correo, rfc, created_at, updated_at) VALUES ('a3299bd7-16d6-45aa-b187-8a5856697255', 'Emma Valadez Medina', '4772309481', 'adsasdasd@asdads.com', 'PAVJ011113PB4', '2026-02-12 05:24:40.57242+00', '2026-02-12 05:24:40.57242+00');


ALTER TABLE finanzas_casadepiedra.clientes ENABLE TRIGGER ALL;

--
-- Data for Name: conceptos_catalogo; Type: TABLE DATA; Schema: finanzas_casadepiedra; Owner: postgres
--

ALTER TABLE finanzas_casadepiedra.conceptos_catalogo DISABLE TRIGGER ALL;

INSERT INTO finanzas_casadepiedra.conceptos_catalogo (id, nombre, precio_sugerido, activo, created_at) VALUES (3, 'Día de premontaje (CORTESÍA)', 0, true, '2026-01-27 03:55:45+00');
INSERT INTO finanzas_casadepiedra.conceptos_catalogo (id, nombre, precio_sugerido, activo, created_at) VALUES (5, 'X horas extra (CORTESÍA)', 0, true, '2026-02-28 00:56:58.743102+00');


ALTER TABLE finanzas_casadepiedra.conceptos_catalogo ENABLE TRIGGER ALL;

--
-- Data for Name: configuracion; Type: TABLE DATA; Schema: finanzas_casadepiedra; Owner: pocketbase_admin
--

ALTER TABLE finanzas_casadepiedra.configuracion DISABLE TRIGGER ALL;

INSERT INTO finanzas_casadepiedra.configuracion (id, clave, valor_num, valor_json, created_at, updated_at) VALUES (1, 'premontaje_pct', 25, '{"value": 25}', '2026-02-28 19:38:18.552705+00', '2026-02-28 19:38:18.552705+00');
INSERT INTO finanzas_casadepiedra.configuracion (id, clave, valor_num, valor_json, created_at, updated_at) VALUES (3, 'hora_extra_cfg', 5900, '{"mode": "fixed", "value": 5900, "updated_at": "2026-03-02T21:06:37.621Z", "allow_custom": true}', '2026-03-02 21:06:37.670477+00', '2026-03-02 21:06:37.670477+00');


ALTER TABLE finanzas_casadepiedra.configuracion ENABLE TRIGGER ALL;

--
-- Data for Name: cotizaciones; Type: TABLE DATA; Schema: finanzas_casadepiedra; Owner: postgres
--

ALTER TABLE finanzas_casadepiedra.cotizaciones DISABLE TRIGGER ALL;

INSERT INTO finanzas_casadepiedra.cotizaciones (id, created_at, creado_por, espacio_id, espacio_nombre, espacio_clave, cliente_nombre, cliente_rfc, cliente_contacto, cliente_email, fecha_inicio, fecha_fin, precio_final, desglose_precios, status, numero_orden, numero_contrato, factura_pdf_url, factura_xml_url, contrato_url, url_cotizacion_final, url_orden_compra, fecha_orden_compra, datos_fiscales, conceptos_adicionales, tipo_ajuste, valor_ajuste, ajuste_es_porcentaje, desglose_impuestos, historial_pagos, datos_factura, cliente_id, personas, detalles_evento, espacios_detalle, nombre_cotizacion) VALUES ('8c71cdbd-65aa-484d-a88a-0aa8b187c301', '2026-03-02 21:14:27.477009+00', '2d353feb-16d5-43fb-9529-d1334f4c6059', 3, 'Terraza del Mezquite + 1 espacio(s)', 'MULTI', 'Johan Jacob Paz Valadez', 'PAVJ011113PB6', '4771631661', 'johanjacobpazvaladez@gmail.com', '2026-03-23', '2026-03-25', 264947, '{"espacios": [{"horario": {"end": "", "label": "prueba (13:00 a 17:00)", "start": "", "value": "prueba", "amount": 0}, "personas": 100, "fecha_fin": "2026-03-25", "espacio_id": "3", "horas_extra": 1, "fecha_inicio": "2026-03-25", "espacio_clave": "3465", "fechas_evento": ["2026-03-25"], "impuestos_ids": [1], "espacio_nombre": "Terraza del Mezquite", "impuestos_total": 4544, "premontaje_dias": 1, "premontaje_total": 4500, "subtotal_espacio": 28400, "horas_extra_total": 5900, "premontaje_fechas": ["2026-03-24"], "premontaje_detalle": [{"date": "2026-03-24", "amount": 4500, "base_day": 18000, "courtesy": false, "porcentaje": 25}], "horas_extra_cortesia": 0, "horas_extra_unitario": 5900, "horas_extra_facturables": 1, "premontaje_cortesia_dias": 0}, {"horario": {"end": "", "label": "prueba (13:00 a 17:00)", "start": "", "value": "prueba", "amount": 0}, "personas": 500, "fecha_fin": "2026-03-25", "espacio_id": "1", "horas_extra": 2, "fecha_inicio": "2026-03-23", "espacio_clave": "898", "fechas_evento": ["2026-03-23", "2026-03-24", "2026-03-25"], "impuestos_ids": [1], "espacio_nombre": "Salón Principal", "impuestos_total": 35448, "premontaje_dias": 2, "premontaje_total": 29750, "subtotal_espacio": 221550, "horas_extra_total": 11800, "premontaje_fechas": ["2026-03-21", "2026-03-22"], "premontaje_detalle": [{"date": "2026-03-21", "amount": 29750, "base_day": 119000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-22", "amount": 0, "base_day": 48500, "courtesy": true, "porcentaje": 25}], "horas_extra_cortesia": 0, "horas_extra_unitario": 5900, "horas_extra_facturables": 2, "premontaje_cortesia_dias": 1}], "tax_total": 39992, "impuestos_detalle": ["1"], "subtotal_antes_impuestos": 249950}', 'aprobada', '8C71CDBD', NULL, NULL, NULL, NULL, '8c71cdbd-65aa-484d-a88a-0aa8b187c301/cotizacion_aprobada_8C71CDBD.pdf', NULL, NULL, '{}', '[{"meta": {"selected": "prueba", "space_id": "3", "custom_end": "", "custom_name": "prueba (13:00 a 17:00)", "custom_start": ""}, "type": "b2b_horario", "unit": "fixed", "value": 0, "amount": 0, "description": "[Terraza del Mezquite] - Horario (prueba (13:00 a 17:00))"}, {"meta": {"days": 1, "dates": ["2026-03-24"], "space_id": "3", "percentage": 25, "per_day_base": [{"date": "2026-03-24", "amount": 4500, "base_day": 18000, "courtesy": false, "porcentaje": 25}], "courtesy_days": 0}, "type": "b2b_montaje", "unit": "fixed", "value": 4500, "amount": 4500, "description": "[Terraza del Mezquite] - Premontaje (dias: 1, cortesia: 0, cobro: 1)"}, {"meta": {"hours": 1, "space_id": "3", "raw_hours": 1, "unit_price": 5900, "courtesy_hours": 0}, "type": "b2b_horas", "unit": "fixed", "value": 5900, "amount": 5900, "description": "[Terraza del Mezquite] - Horas extra (hrs: 1, cortesia: 0, cobro: 1)"}, {"meta": {"selected": "prueba", "space_id": "1", "custom_end": "", "custom_name": "prueba (13:00 a 17:00)", "custom_start": ""}, "type": "b2b_horario", "unit": "fixed", "value": 0, "amount": 0, "description": "[Salón Principal] - Horario (prueba (13:00 a 17:00))"}, {"meta": {"days": 2, "dates": ["2026-03-21", "2026-03-22"], "space_id": "1", "percentage": 25, "per_day_base": [{"date": "2026-03-21", "amount": 29750, "base_day": 119000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-22", "amount": 0, "base_day": 48500, "courtesy": true, "porcentaje": 25}], "courtesy_days": 1}, "type": "b2b_montaje", "unit": "fixed", "value": 29750, "amount": 29750, "description": "[Salón Principal] - Premontaje (dias: 2, cortesia: 1, cobro: 1)"}, {"meta": {"hours": 2, "space_id": "1", "raw_hours": 2, "unit_price": 5900, "courtesy_hours": 0}, "type": "b2b_horas", "unit": "fixed", "value": 11800, "amount": 11800, "description": "[Salón Principal] - Horas extra (hrs: 2, cortesia: 0, cobro: 2)"}]', 'descuento', 10, true, '[]', '[]', '{}', 'b51df6c1-e0f1-4860-904d-8b03cd055d79', 500, '{"multi_espacio": true, "total_espacios": 2, "nombre_cotizacion": "bazar"}', '[{"horario": {"end": "", "label": "prueba (13:00 a 17:00)", "start": "", "value": "prueba", "amount": 0}, "personas": 100, "fecha_fin": "2026-03-25", "espacio_id": "3", "horas_extra": 1, "fecha_inicio": "2026-03-25", "espacio_clave": "3465", "fechas_evento": ["2026-03-25"], "impuestos_ids": [1], "espacio_nombre": "Terraza del Mezquite", "impuestos_total": 4544, "premontaje_dias": 1, "premontaje_total": 4500, "subtotal_espacio": 28400, "horas_extra_total": 5900, "premontaje_fechas": ["2026-03-24"], "premontaje_detalle": [{"date": "2026-03-24", "amount": 4500, "base_day": 18000, "courtesy": false, "porcentaje": 25}], "horas_extra_cortesia": 0, "horas_extra_unitario": 5900, "horas_extra_facturables": 1, "premontaje_cortesia_dias": 0}, {"horario": {"end": "", "label": "prueba (13:00 a 17:00)", "start": "", "value": "prueba", "amount": 0}, "personas": 500, "fecha_fin": "2026-03-25", "espacio_id": "1", "horas_extra": 2, "fecha_inicio": "2026-03-23", "espacio_clave": "898", "fechas_evento": ["2026-03-23", "2026-03-24", "2026-03-25"], "impuestos_ids": [1], "espacio_nombre": "Salón Principal", "impuestos_total": 35448, "premontaje_dias": 2, "premontaje_total": 29750, "subtotal_espacio": 221550, "horas_extra_total": 11800, "premontaje_fechas": ["2026-03-21", "2026-03-22"], "premontaje_detalle": [{"date": "2026-03-21", "amount": 29750, "base_day": 119000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-22", "amount": 0, "base_day": 48500, "courtesy": true, "porcentaje": 25}], "horas_extra_cortesia": 0, "horas_extra_unitario": 5900, "horas_extra_facturables": 2, "premontaje_cortesia_dias": 1}]', 'bazar');
INSERT INTO finanzas_casadepiedra.cotizaciones (id, created_at, creado_por, espacio_id, espacio_nombre, espacio_clave, cliente_nombre, cliente_rfc, cliente_contacto, cliente_email, fecha_inicio, fecha_fin, precio_final, desglose_precios, status, numero_orden, numero_contrato, factura_pdf_url, factura_xml_url, contrato_url, url_cotizacion_final, url_orden_compra, fecha_orden_compra, datos_fiscales, conceptos_adicionales, tipo_ajuste, valor_ajuste, ajuste_es_porcentaje, desglose_impuestos, historial_pagos, datos_factura, cliente_id, personas, detalles_evento, espacios_detalle, nombre_cotizacion) VALUES ('0831e1bd-899f-4faa-9358-ee6dc4dcf79d', '2026-03-02 21:21:12.772136+00', '2d353feb-16d5-43fb-9529-d1334f4c6059', 1, 'Salón Principal', '898', 'Emma Valadez Medina', 'PAVJ011113PB4', '4772309481', 'adsasdasd@asdads.com', '2026-04-02', '2026-04-02', 54520, '{"espacios": [{"horario": {"label": "prueba (13:00 a 17:00)", "value": "prueba", "amount": 0}, "personas": 100, "fecha_fin": "2026-04-02", "espacio_id": 1, "horas_extra": 0, "fecha_inicio": "2026-04-02", "espacio_clave": "898", "fechas_evento": ["2026-04-02"], "impuestos_ids": [1], "espacio_nombre": "Salón Principal", "impuestos_total": 7520, "premontaje_dias": 0, "premontaje_total": 0, "subtotal_espacio": 47000, "horas_extra_total": 0, "premontaje_fechas": [], "premontaje_detalle": [], "horas_extra_cortesia": 0, "horas_extra_unitario": 5900, "horas_extra_facturables": 0, "premontaje_cortesia_dias": 0}], "tax_total": 7520, "impuestos_detalle": ["1"], "subtotal_antes_impuestos": 47000}', 'pendiente', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', '[{"meta": {"selected": "prueba", "space_id": 1, "custom_name": "prueba (13:00 a 17:00)"}, "type": "b2b_horario", "unit": "fixed", "value": 0, "amount": 0, "description": "[Salón Principal] - Horario (prueba (13:00 a 17:00))"}]', 'ninguno', 0, false, '[]', '[]', '{}', 'a3299bd7-16d6-45aa-b187-8a5856697255', 100, '{"multi_espacio": false, "total_espacios": 1, "nombre_cotizacion": "Boda"}', '[{"horario": {"label": "prueba (13:00 a 17:00)", "value": "prueba", "amount": 0}, "personas": 100, "fecha_fin": "2026-04-02", "espacio_id": 1, "horas_extra": 0, "fecha_inicio": "2026-04-02", "espacio_clave": "898", "fechas_evento": ["2026-04-02"], "impuestos_ids": [1], "espacio_nombre": "Salón Principal", "impuestos_total": 7520, "premontaje_dias": 0, "premontaje_total": 0, "subtotal_espacio": 47000, "horas_extra_total": 0, "premontaje_fechas": [], "premontaje_detalle": [], "horas_extra_cortesia": 0, "horas_extra_unitario": 5900, "horas_extra_facturables": 0, "premontaje_cortesia_dias": 0}]', 'Boda');
INSERT INTO finanzas_casadepiedra.cotizaciones (id, created_at, creado_por, espacio_id, espacio_nombre, espacio_clave, cliente_nombre, cliente_rfc, cliente_contacto, cliente_email, fecha_inicio, fecha_fin, precio_final, desglose_precios, status, numero_orden, numero_contrato, factura_pdf_url, factura_xml_url, contrato_url, url_cotizacion_final, url_orden_compra, fecha_orden_compra, datos_fiscales, conceptos_adicionales, tipo_ajuste, valor_ajuste, ajuste_es_porcentaje, desglose_impuestos, historial_pagos, datos_factura, cliente_id, personas, detalles_evento, espacios_detalle, nombre_cotizacion) VALUES ('169de6e3-01ea-4d31-b374-1016789fe825', '2026-03-02 00:45:36.461477+00', '2d353feb-16d5-43fb-9529-d1334f4c6059', 1, 'Salón Principal', '898', 'Johan Jacob Paz Valadez', 'PAVJ011113PB6', '4771631661', 'johanjacobpazvaladez@gmail.com', '2026-03-15', '2026-03-15', 106720, '{"espacios": [{"horario": {"end": "", "label": "prueba (13:00 a 17:00)", "start": "", "value": "prueba", "amount": 0}, "personas": 100, "fecha_fin": "2026-03-15", "espacio_id": "1", "horas_extra": 5, "fecha_inicio": "2026-03-15", "espacio_clave": "898", "fechas_evento": ["2026-03-15"], "impuestos_ids": [1], "espacio_nombre": "Salón Principal", "impuestos_total": 14720, "premontaje_dias": 5, "premontaje_total": 55500, "subtotal_espacio": 92000, "horas_extra_total": 0, "premontaje_fechas": ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14"], "premontaje_detalle": [{"date": "2026-03-10", "amount": 11750, "base_day": 47000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-11", "amount": 0, "base_day": 47000, "courtesy": true, "porcentaje": 25}, {"date": "2026-03-12", "amount": 0, "base_day": 47000, "courtesy": true, "porcentaje": 25}, {"date": "2026-03-13", "amount": 19750, "base_day": 79000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-14", "amount": 24000, "base_day": 96000, "courtesy": false, "porcentaje": 25}], "horas_extra_cortesia": 3, "horas_extra_unitario": 0, "horas_extra_facturables": 2, "premontaje_cortesia_dias": 2}], "tax_total": 14720, "impuestos_detalle": ["1"], "subtotal_antes_impuestos": 92000}', 'aprobada', '169DE6E3', NULL, NULL, NULL, NULL, '169de6e3-01ea-4d31-b374-1016789fe825/cotizacion_aprobada_169DE6E3.pdf', '169de6e3-01ea-4d31-b374-1016789fe825/orden_compra_169DE6E3.pdf', '2026-03-02 00:46:37.806+00', '{}', '[{"meta": {"selected": "prueba", "space_id": "1", "custom_end": "", "custom_name": "prueba (13:00 a 17:00)", "custom_start": ""}, "type": "b2b_horario", "unit": "fixed", "value": 0, "amount": 0, "description": "[Salón Principal] - Horario (prueba (13:00 a 17:00))"}, {"meta": {"days": 5, "dates": ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14"], "space_id": "1", "percentage": 25, "per_day_base": [{"date": "2026-03-10", "amount": 11750, "base_day": 47000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-11", "amount": 0, "base_day": 47000, "courtesy": true, "porcentaje": 25}, {"date": "2026-03-12", "amount": 0, "base_day": 47000, "courtesy": true, "porcentaje": 25}, {"date": "2026-03-13", "amount": 19750, "base_day": 79000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-14", "amount": 24000, "base_day": 96000, "courtesy": false, "porcentaje": 25}], "courtesy_days": 2}, "type": "b2b_montaje", "unit": "fixed", "value": 55500, "amount": 55500, "description": "[Salón Principal] - Premontaje (dias: 5, cortesia: 2, cobro: 3)"}, {"meta": {"hours": 2, "space_id": "1", "raw_hours": 5, "unit_price": 0, "courtesy_hours": 3}, "type": "b2b_horas", "unit": "fixed", "value": 0, "amount": 0, "description": "[Salón Principal] - Horas extra (hrs: 5, cortesia: 3, cobro: 2)"}]', 'ninguno', 0, false, '[]', '[]', '{}', 'b51df6c1-e0f1-4860-904d-8b03cd055d79', 100, '{"multi_espacio": false, "total_espacios": 1, "nombre_cotizacion": "Johan Jacob Paz Valadez - Salón Principal"}', '[{"horario": {"end": "", "label": "prueba (13:00 a 17:00)", "start": "", "value": "prueba", "amount": 0}, "personas": 100, "fecha_fin": "2026-03-15", "espacio_id": "1", "horas_extra": 5, "fecha_inicio": "2026-03-15", "espacio_clave": "898", "fechas_evento": ["2026-03-15"], "impuestos_ids": [1], "espacio_nombre": "Salón Principal", "impuestos_total": 14720, "premontaje_dias": 5, "premontaje_total": 55500, "subtotal_espacio": 92000, "horas_extra_total": 0, "premontaje_fechas": ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14"], "premontaje_detalle": [{"date": "2026-03-10", "amount": 11750, "base_day": 47000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-11", "amount": 0, "base_day": 47000, "courtesy": true, "porcentaje": 25}, {"date": "2026-03-12", "amount": 0, "base_day": 47000, "courtesy": true, "porcentaje": 25}, {"date": "2026-03-13", "amount": 19750, "base_day": 79000, "courtesy": false, "porcentaje": 25}, {"date": "2026-03-14", "amount": 24000, "base_day": 96000, "courtesy": false, "porcentaje": 25}], "horas_extra_cortesia": 3, "horas_extra_unitario": 0, "horas_extra_facturables": 2, "premontaje_cortesia_dias": 2}]', 'Johan Jacob Paz Valadez - Salón Principal');


ALTER TABLE finanzas_casadepiedra.cotizaciones ENABLE TRIGGER ALL;

--
-- Data for Name: espacios; Type: TABLE DATA; Schema: finanzas_casadepiedra; Owner: postgres
--

ALTER TABLE finanzas_casadepiedra.espacios DISABLE TRIGGER ALL;

INSERT INTO finanzas_casadepiedra.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, precios_por_dia, dias_bloqueados, etiquetas, config_b2b) VALUES (1, '2026-01-25 10:40:36.543168+00', '898', 'Salón Principal', 'espacio', 'Un espacio privado y agradable, techado, con gran iluminación y delimitado por elegantes muros apanelados, con capacidad para 1000 personas, se convierte en el escenario perfecto para eventos como bodas, xv años, conferencias y eventos corporativos.

Medidas: Por definir.', NULL, 'http://127.0.0.1:55551/storage/v1/object/public/Espacios/espacios/1771267532568.png', true, 119000, 'ninguno', 0, true, '[1]', '#f10463', '[{"max": 400, "min": 1, "precios": {"lunes": 47000, "jueves": 47000, "martes": 47000, "sabado": 96000, "domingo": 36500, "viernes": 79000, "miercoles": 47000}}, {"max": 800, "min": 401, "precios": {"lunes": 60000, "jueves": 60000, "martes": 60000, "sabado": 119000, "domingo": 48500, "viernes": 85000, "miercoles": 60000}}]', '[]', '["Salón", "Gran Formato", "Techado"]', '{"horarios": [{"end": "17:00", "price": 0, "start": "13:00", "nombre": "prueba"}, {"end": "12:00", "price": 0, "start": "08:00", "nombre": "prueba 2"}], "precio_hora_extra": 0}');
INSERT INTO finanzas_casadepiedra.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, precios_por_dia, dias_bloqueados, etiquetas, config_b2b) VALUES (3, '2026-01-27 06:19:41.120497+00', '3465', 'Terraza del Mezquite', 'espacio', 'Al aire libre y enmarcada por hermosos arcos coloniales y fuentes minimalistas que ofrecen un ambiente de relajación y vistas elegantes y acogedoras. Con una capacidad para 200 personas, este lugar es el espacio ideal para eventos como despedidas de soltera, fiestas de cumpleaños, primeras comuniones, bautizos, fiestas infantiles y reuniones corporativas.

Ubicación: Por definir.
Medidas: Por definir.', NULL, 'http://127.0.0.1:55551/storage/v1/object/public/Espacios/espacios/1771267580304.png', true, 36500, 'ninguno', 0, true, '[1]', '#e68a0a', '[{"max": 150, "min": 1, "precios": {"lunes": 18000, "jueves": 18000, "martes": 18000, "sabado": 0, "domingo": 11000, "viernes": 36500, "miercoles": 18000}}]', '[]', '["Terraza", "Al aire libre", "Social"]', '{"horarios": [{"end": "17:00", "price": 0, "start": "13:00", "nombre": "prueba"}], "precio_hora_extra": 0}');
INSERT INTO finanzas_casadepiedra.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, precios_por_dia, dias_bloqueados, etiquetas, config_b2b) VALUES (2, '2026-01-27 06:19:23.498178+00', '346543', 'Salón Pavoreales', 'espacio', 'Un salón privado, que pareciera una hermosa réplica de nuestro salón principal, con ambientación delicada y elegante y la privacidad necesaria para reuniones sociales o empresariales. Cuenta con una capacidad para 70 personas en un evento empresarial, y con un montaje estilo auditorio, la capacidad incrementa para 100 personas.

Ubicación: Por definir.
Medidas: Por definir.', NULL, 'http://127.0.0.1:55551/storage/v1/object/public/Espacios/espacios/1771267563277.png', true, 24000, 'ninguno', 0, true, '[1]', '#0ced27', '[{"max": 90, "min": 1, "precios": {"lunes": 12000, "jueves": 12000, "martes": 12000, "sabado": 24000, "domingo": 6000, "viernes": 18000, "miercoles": 12000}}]', '[]', '["Salón", "Privado", "Empresarial"]', '{"horarios": [{"end": "17:00", "price": 0, "start": "13:00", "nombre": "Prueba"}], "precio_montaje": 0, "precio_hora_extra": 0}');
INSERT INTO finanzas_casadepiedra.espacios (id, created_at, clave, nombre, tipo, descripcion, requisitos, imagen_url, activo, precio_base, ajuste_tipo, ajuste_porcentaje, activa, impuestos_ids, color, precios_por_dia, dias_bloqueados, etiquetas, config_b2b) VALUES (4, '2026-01-27 06:19:51.858826+00', '123412', 'Jardín Principal', 'espacio', 'Un espacio abierto, rodeado de la icónica arquitectura de la Ex-Hacienda aunado de una increíble vegetación. Cuenta con capacidad máxima para 1500 personas, es el único recinto en la ciudad de León que permite albergar a este gran número de comensales. El jardín de Casa de Piedra es el escenario perfecto para realizar eventos al aire libre en donde la naturaleza interviene como uno de los principales elementos para brindarte un ambiente encantador.

Ubicación: Por definir.
Medidas: Por definir.', NULL, 'http://127.0.0.1:55551/storage/v1/object/public/Espacios/espacios/1771267607940.png', true, 145000, 'ninguno', 0, true, '[1]', '#0d5fe3', '[{"max": 300, "min": 1, "precios": {"lunes": 36000, "jueves": 36000, "martes": 36000, "sabado": 75000, "domingo": 22000, "viernes": 50000, "miercoles": 36000}}, {"max": 900, "min": 301, "precios": {"lunes": 58000, "jueves": 58000, "martes": 58000, "sabado": 110000, "domingo": 36500, "viernes": 81500, "miercoles": 58000}}, {"max": 1500, "min": 901, "precios": {"lunes": 77000, "jueves": 77000, "martes": 77000, "sabado": 145000, "domingo": 47500, "viernes": 110500, "miercoles": 77000}}]', '[]', '["Jardín", "Al aire libre", "Gran Formato"]', '{"horarios": [{"end": "17:00", "price": 0, "start": "13:00", "nombre": "Prueb"}], "precio_montaje": 0, "precio_hora_extra": 0}');


ALTER TABLE finanzas_casadepiedra.espacios ENABLE TRIGGER ALL;

--
-- Data for Name: impuestos; Type: TABLE DATA; Schema: finanzas_casadepiedra; Owner: postgres
--

ALTER TABLE finanzas_casadepiedra.impuestos DISABLE TRIGGER ALL;

INSERT INTO finanzas_casadepiedra.impuestos (id, nombre, porcentaje, activo, created_at, impuestos_aplicados) VALUES (1, 'IVA', 16, true, '2026-01-25 10:41:36+00', NULL);


ALTER TABLE finanzas_casadepiedra.impuestos ENABLE TRIGGER ALL;

--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles DISABLE TRIGGER ALL;

INSERT INTO public.profiles (id, email, username, role, tenant, app_metadata, created_at, updated_at, allowed_tenants) VALUES ('2d353feb-16d5-43fb-9529-d1334f4c6059', 'admin@cotizador.com', 'admin', 'admin', 'plaza_mayor', '{}', '2026-02-14 21:12:20.560271+00', '2026-02-14 21:14:51.558573+00', '{plaza_mayor,casa_de_piedra}');
INSERT INTO public.profiles (id, email, username, role, tenant, app_metadata, created_at, updated_at, allowed_tenants) VALUES ('1b099fcd-164b-49dc-af4a-c64f4b16961d', 'admin@casadepiedra.com', 'admin Casa de Piedra', 'casa_de_piedra', 'casa_de_piedra', '{}', '2026-02-16 22:36:58.182798+00', '2026-02-16 22:47:20.699165+00', '{casa_de_piedra}');
INSERT INTO public.profiles (id, email, username, role, tenant, app_metadata, created_at, updated_at, allowed_tenants) VALUES ('9eccd179-b0b6-4ee1-b37a-f9fb2e1771a0', 'admin@plazamayor.com', 'admin plaza mayor', 'plaza_mayor', 'plaza_mayor', '{}', '2026-02-16 21:40:39.19873+00', '2026-02-16 22:47:34.161357+00', '{plaza_mayor}');


ALTER TABLE public.profiles ENABLE TRIGGER ALL;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: pocketbase_auth_admin
--

SELECT pg_catalog.setval('auth.refresh_tokens_id_seq', 165, true);


--
-- Name: conceptos_catalogo_id_seq; Type: SEQUENCE SET; Schema: finanzas; Owner: postgres
--

SELECT pg_catalog.setval('finanzas.conceptos_catalogo_id_seq', 6, true);


--
-- Name: configuracion_id_seq; Type: SEQUENCE SET; Schema: finanzas; Owner: pocketbase_admin
--

SELECT pg_catalog.setval('finanzas.configuracion_id_seq', 35, true);


--
-- Name: espacios_id_seq; Type: SEQUENCE SET; Schema: finanzas; Owner: postgres
--

SELECT pg_catalog.setval('finanzas.espacios_id_seq', 32, true);


--
-- Name: impuestos_id_seq; Type: SEQUENCE SET; Schema: finanzas; Owner: postgres
--

SELECT pg_catalog.setval('finanzas.impuestos_id_seq', 2, true);


--
-- Name: conceptos_catalogo_id_seq; Type: SEQUENCE SET; Schema: finanzas_casadepiedra; Owner: postgres
--

SELECT pg_catalog.setval('finanzas_casadepiedra.conceptos_catalogo_id_seq', 5, true);


--
-- Name: configuracion_id_seq; Type: SEQUENCE SET; Schema: finanzas_casadepiedra; Owner: pocketbase_admin
--

SELECT pg_catalog.setval('finanzas_casadepiedra.configuracion_id_seq', 3, true);


--
-- Name: espacios_id_seq; Type: SEQUENCE SET; Schema: finanzas_casadepiedra; Owner: postgres
--

SELECT pg_catalog.setval('finanzas_casadepiedra.espacios_id_seq', 4, true);


--
-- Name: impuestos_id_seq; Type: SEQUENCE SET; Schema: finanzas_casadepiedra; Owner: postgres
--

SELECT pg_catalog.setval('finanzas_casadepiedra.impuestos_id_seq', 1, true);


--
-- PostgreSQL database dump complete
--

\unrestrict 6LZhiGz8nyygT2UtCG8GU35UrU9ebh2VyKWQMPPfgNX3dNJInlKxg43JPdrEf7j


