exports.up = async function (db) {
  await db.raw(`
  ALTER TABLE sites ADD COLUMN ticket_prefix text;
  CREATE TABLE ticket_prefix_registry (prefix text PRIMARY KEY CHECK(prefix ~ '^[A-Z][A-Z0-9]{1,15}$'),owner_kind text NOT NULL CHECK(owner_kind IN ('CLIENT','SITE','LEGACY')),owner_id uuid,CHECK((owner_kind='LEGACY')=(owner_id IS NULL)));
  INSERT INTO ticket_prefix_registry SELECT ticket_prefix,'CLIENT',id FROM clients;
  INSERT INTO ticket_prefix_registry
    SELECT prefix,CASE WHEN count(DISTINCT client_id)=1 THEN 'CLIENT' ELSE 'LEGACY' END,CASE WHEN count(DISTINCT client_id)=1 THEN min(client_id::text)::uuid ELSE NULL END
    FROM (SELECT regexp_replace(ticket_number,'-[0-9]+$','') prefix,client_id FROM tickets WHERE ticket_number ~ '^[A-Z][A-Z0-9]{1,15}-[0-9]+$') historical GROUP BY prefix ON CONFLICT(prefix) DO NOTHING;
  CREATE FUNCTION reserve_ticket_prefix() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  DECLARE kind text; base text; candidate text; suffix bigint:=1;
  BEGIN
    kind:=CASE WHEN TG_TABLE_NAME='clients' THEN 'CLIENT' ELSE 'SITE' END;
    IF kind='SITE' AND (NEW.ticket_prefix IS NULL OR trim(NEW.ticket_prefix)='') THEN
      SELECT ticket_prefix INTO base FROM public.clients WHERE id=NEW.client_id;
      IF base IS NULL THEN RAISE EXCEPTION 'Customer is required' USING ERRCODE='23514'; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('site-prefix:'||base,0));
      LOOP
        candidate:=base||'S'||CASE WHEN length(suffix::text)<3 THEN lpad(suffix::text,3,'0') ELSE suffix::text END;
        IF length(candidate)>16 THEN RAISE EXCEPTION 'Choose a site ticket prefix' USING ERRCODE='23514'; END IF;
        INSERT INTO public.ticket_prefix_registry VALUES(candidate,kind,NEW.id) ON CONFLICT(prefix) DO NOTHING;
        EXIT WHEN EXISTS(SELECT 1 FROM public.ticket_prefix_registry WHERE prefix=candidate AND owner_kind=kind AND owner_id=NEW.id);
        suffix:=suffix+1;
      END LOOP;
      NEW.ticket_prefix:=candidate;
    END IF;
    NEW.ticket_prefix:=upper(trim(NEW.ticket_prefix));
    INSERT INTO public.ticket_prefix_registry VALUES(NEW.ticket_prefix,kind,NEW.id) ON CONFLICT(prefix) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.ticket_prefix_registry WHERE prefix=NEW.ticket_prefix AND owner_kind=kind AND owner_id=NEW.id) THEN RAISE EXCEPTION 'Ticket prefix is already reserved' USING ERRCODE='23505'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER sites_ticket_prefix BEFORE INSERT OR UPDATE OF ticket_prefix ON sites FOR EACH ROW EXECUTE FUNCTION reserve_ticket_prefix();
  CREATE TRIGGER clients_ticket_prefix BEFORE INSERT OR UPDATE OF ticket_prefix ON clients FOR EACH ROW EXECUTE FUNCTION reserve_ticket_prefix();
  UPDATE sites SET ticket_prefix=NULL;
  ALTER TABLE sites ALTER COLUMN ticket_prefix SET NOT NULL;
  ALTER TABLE sites ADD CONSTRAINT sites_ticket_prefix_format CHECK(ticket_prefix ~ '^[A-Z][A-Z0-9]{1,15}$');
  CREATE UNIQUE INDEX sites_ticket_prefix_uq ON sites(ticket_prefix);
  CREATE TABLE site_ticket_sequences (site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE RESTRICT,next_number bigint NOT NULL DEFAULT 1 CHECK(next_number>0));
  CREATE FUNCTION next_ticket_number(customer_id uuid,request_site_id uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
  DECLARE prefix text; number bigint;
  BEGIN
    IF request_site_id IS NOT NULL THEN
      SELECT ticket_prefix INTO prefix FROM public.sites WHERE id=request_site_id AND client_id=customer_id AND active FOR SHARE;
      IF prefix IS NULL THEN RAISE EXCEPTION 'Site does not belong to this customer' USING ERRCODE='23514'; END IF;
      INSERT INTO public.site_ticket_sequences(site_id,next_number) VALUES(request_site_id,2) ON CONFLICT(site_id) DO UPDATE SET next_number=public.site_ticket_sequences.next_number+1 RETURNING next_number-1 INTO number;
    ELSE
      SELECT ticket_prefix INTO prefix FROM public.clients WHERE id=customer_id FOR SHARE;
      IF prefix IS NULL THEN RAISE EXCEPTION 'Customer is required' USING ERRCODE='23514'; END IF;
      INSERT INTO public.client_ticket_sequences(client_id,next_number) VALUES(customer_id,2) ON CONFLICT(client_id) DO UPDATE SET next_number=public.client_ticket_sequences.next_number+1 RETURNING next_number-1 INTO number;
    END IF;
    RETURN prefix||'-'||CASE WHEN length(number::text)<6 THEN lpad(number::text,6,'0') ELSE number::text END;
  END $$;
  REVOKE ALL ON FUNCTION next_ticket_number(uuid,uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION next_ticket_number(uuid,uuid) TO amnikon_app;
  GRANT SELECT ON ticket_prefix_registry TO amnikon_app;
  GRANT SELECT,INSERT,UPDATE ON site_ticket_sequences TO amnikon_app;
  UPDATE app_schema_state SET version=24 WHERE id=1;
 `);
};
exports.down = async function () {
  throw new Error(
    'Retain site prefixes and ticket number history. Roll back application images without removing numbering data.',
  );
};
